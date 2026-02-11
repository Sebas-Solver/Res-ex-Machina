import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';

/**
 * Configura rate limiting en la aplicación.
 *
 * Dos niveles:
 * 1. Global: 100 req/min por IP (todos los endpoints)
 * 2. POST /records: 10 req/min por IP (más estricto, ruta-level)
 *
 * Headers de respuesta:
 * - X-RateLimit-Limit
 * - X-RateLimit-Remaining
 * - X-RateLimit-Reset
 *
 * Nota: En producción con múltiples instancias, migrar a Redis store.
 * Referencia: PRD v1.1, Threat Model D-01/D-03
 */
export async function registerRateLimit(app: FastifyInstance): Promise<void> {
    await app.register(rateLimit, {
        max: 100,                  // 100 requests por ventana
        timeWindow: '1 minute',    // Ventana de 1 minuto
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
 * Uso: aplicar como onRequest hook en el POST route.
 */
export const postRecordsRateConfig = {
    config: {
        rateLimit: {
            max: 10,
            timeWindow: '1 minute',
            keyGenerator: (request: { ip: string; body?: Record<string, unknown> }) => {
                // Intentar extraer wallet del body para rate limit por wallet
                const body = request.body as { pog_bundle?: { agent_wallet?: string } } | undefined;
                const wallet = body?.pog_bundle?.agent_wallet;
                if (wallet) {
                    return `wallet:${wallet.toLowerCase()}`;
                }
                return request.ip;
            },
        },
    },
};
