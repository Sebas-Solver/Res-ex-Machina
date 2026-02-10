import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';

/**
 * Configura rate limiting global en la aplicación.
 *
 * Límites:
 * - Global: 100 requests/minuto por IP
 * - POST /records: más estricto (10/min) — se aplicará via route-level config
 *
 * Usa almacenamiento en memoria (no Redis) para simplicidad.
 * En producción con múltiples instancias, cambiar a Redis store.
 *
 * Headers de respuesta:
 * - X-RateLimit-Limit
 * - X-RateLimit-Remaining
 * - X-RateLimit-Reset
 *
 * Referencia: PRD v1.1, Threat Model D-01/D-03
 */
export async function registerRateLimit(app: FastifyInstance): Promise<void> {
    await app.register(rateLimit, {
        max: 100,                  // 100 requests por ventana
        timeWindow: '1 minute',    // Ventana de 1 minuto
        keyGenerator: (request) => {
            // Rate limit por IP
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
