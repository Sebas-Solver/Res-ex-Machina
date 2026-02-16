import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import { createRateLimitRedisClient } from '../config/redis.js';

/**
 * Configura rate limiting en la aplicación.
 *
 * Dos niveles:
 * 1. Global: 100 req/min por IP (todos los endpoints)
 * 2. POST /records: 10 req/min por IP (más estricto, ruta-level)
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

/**
 * Rate limit específico para POST /v1/records.
 * 10 req/min por IP + wallet (si disponible en body).
 *
 * Uso: aplicar como config en la declaración de la ruta POST.
 *
 * NOTA: El keyGenerator intenta leer wallet del body. Fastify garantiza
 * que el body está parseado antes de ejecutar el rate limit cuando se usa
 * como route-level config (no como onRequest hook). Si el body no se ha
 * parseado aún (ej. req malformada), el fallback a IP asegura protección.
 */
export const postRecordsRateConfig = {
    config: {
        rateLimit: {
            max: 10,
            timeWindow: '1 minute',
            keyGenerator: (request: { ip: string; body?: Record<string, unknown> }) => {
                // Intentar extraer wallet para rate limit más granular.
                // Fallback a IP si el body no está disponible o no tiene wallet.
                try {
                    const body = request.body as { pog_bundle?: { agent_wallet?: string } } | undefined;
                    const wallet = body?.pog_bundle?.agent_wallet;
                    if (wallet) {
                        return `wallet:${wallet.toLowerCase()}`;
                    }
                } catch {
                    // Body no parseado — fallback a IP
                }
                return request.ip;
            },
        },
    },
};
