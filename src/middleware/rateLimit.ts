import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import { createRateLimitRedisClient } from '../config/redis.js';

/**
 * Configures rate limiting in the application.
 *
 * Dos niveles:
 * 1. Global: 100 req/min por IP (todos los endpoints)
 * 2. POST /records: 10 req/min per IP (stricter, route-level)
 *
 * Store: Redis compartido (Issue #17).
 * Resiliencia: skipOnError = true → si Redis cae, rate limit se
 * desactiva temporalmente en vez de tumbar la API (Issue #22).
 *
 * Headers de respuesta:
 * - X-RateLimit-Limit
 * - X-RateLimit-Remaining
 * - X-RateLimit-Reset
 *
 * Referencia: PRD v1.1, Threat Model D-01/D-03
 */

// Cliente Redis singleton para rate limiting
let rateLimitRedis: ReturnType<typeof createRateLimitRedisClient> | null = null;

function getRateLimitRedis() {
    if (!rateLimitRedis) {
        rateLimitRedis = createRateLimitRedisClient();

        rateLimitRedis.on('error', (err) => {
            console.warn(`⚠️ Rate limit Redis error (fallback to in-memory): ${err.message}`);
        });
    }
    return rateLimitRedis;
}

export async function registerRateLimit(app: FastifyInstance): Promise<void> {
    await app.register(rateLimit, {
        max: 100,                  // 100 requests por ventana
        timeWindow: '1 minute',    // Ventana de 1 minuto
        redis: getRateLimitRedis(),
        nameSpace: 'rxm-rl:',     // Prefijo en Redis para evitar colisiones
        skipOnError: true,         // Issue #22: si Redis falla, no bloquear requests
        keyGenerator: (request) => {
            return request.ip;
        },
        errorResponseBuilder: (_request, context) => {
            return {
                error: {
                    code: 'rate_limit_exceeded',
                    message: `Too many requests. Limit: ${context.max} per ${context.after}`,
                    details: {
                        limit: context.max,
                        remaining: 0,
                        reset: context.after,
                    },
                },
            };
        },
    });
}

