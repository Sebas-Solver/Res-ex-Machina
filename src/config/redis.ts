import { env } from './env.js';
import { Redis } from 'ioredis';

/**
 * Configuración Redis compartida.
 *
 * Parsea REDIS_URL una sola vez y exporta:
 * - `redisConnectionConfig` — para BullMQ (Queue + Worker)
 * - `createHealthRedisClient()` — para health check (ioredis con lazyConnect)
 *
 * Archivos que consumen:
 * - src/services/queue.ts       (BullMQ Queue)
 * - src/workers/anchor.worker.ts (BullMQ Worker)
 * - src/routes/health.ts        (ioredis PING)
 */

const redisUrl = new URL(env.REDIS_URL);

/**
 * Objeto de conexión para BullMQ (Queue y Worker).
 * `maxRetriesPerRequest: null` es requerido por BullMQ.
 */
export const redisConnectionConfig = {
    host: redisUrl.hostname,
    port: parseInt(redisUrl.port || '6379', 10),
    password: redisUrl.password || undefined,
    tls: redisUrl.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null as null,
};

/**
 * Factory para crear un cliente ioredis para el health check.
 *
 * Usa lazyConnect para no conectar hasta el primer PING.
 * connectTimeout de 3s para no bloquear el health check.
 * maxRetriesPerRequest: 1 para fallar rápido si Redis no responde.
 */
export function createHealthRedisClient(): Redis {
    const client = new Redis({
        host: redisUrl.hostname,
        port: parseInt(redisUrl.port || '6379', 10),
        password: redisUrl.password || undefined,
        tls: redisUrl.protocol === 'rediss:' ? {} : undefined,
        maxRetriesPerRequest: 1,
        connectTimeout: 3000,
        lazyConnect: true,
    });

    return client;
}

/**
 * Factory para crear un cliente ioredis para rate limiting (Issue #17).
 *
 * Usa lazyConnect y connectTimeout corto para no bloquear el startup.
 * Si Redis no está disponible, @fastify/rate-limit con skipOnError
 * hace fallback a in-memory automáticamente (Issue #22).
 */
export function createRateLimitRedisClient(): Redis {
    const client = new Redis({
        host: redisUrl.hostname,
        port: parseInt(redisUrl.port || '6379', 10),
        password: redisUrl.password || undefined,
        tls: redisUrl.protocol === 'rediss:' ? {} : undefined,
        maxRetriesPerRequest: 1,
        connectTimeout: 3000,
        lazyConnect: true,
        enableOfflineQueue: false,
    });

    return client;
}
