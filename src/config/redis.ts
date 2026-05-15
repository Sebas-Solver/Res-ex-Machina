// SPDX-License-Identifier: Apache-2.0

import { env } from './env.js';
import { Redis } from 'ioredis';

/**
 * Shared Redis configuration.
 *
 * Parses REDIS_URL once and exports:
 * - `redisConnectionConfig` — for BullMQ (Queue + Worker)
 * - `createHealthRedisClient()` — for health check (ioredis with lazyConnect)
 *
 * Consumers:
 * - src/services/queue.ts       (BullMQ Queue)
 * - src/workers/anchor.worker.ts (BullMQ Worker)
 * - src/routes/health.ts        (ioredis PING)
 */

const redisUrl = new URL(env.REDIS_URL);

/**
 * Connection object for BullMQ (Queue and Worker).
 * `maxRetriesPerRequest: null` is required by BullMQ.
 */
export const redisConnectionConfig = {
    host: redisUrl.hostname,
    port: parseInt(redisUrl.port || '6379', 10),
    password: redisUrl.password || undefined,
    tls: redisUrl.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null as null,
};

/**
 * Factory to create an ioredis client for the health check.
 *
 * Uses lazyConnect to avoid connecting until the first PING.
 * connectTimeout of 3s to avoid blocking the health check.
 * maxRetriesPerRequest: 1 to fail fast if Redis is unresponsive.
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
 * Factory to create an ioredis client for rate limiting (Issue #17).
 *
 * Uses lazyConnect and short connectTimeout to avoid blocking startup.
 * When Redis is unavailable, the rate limiter activates a degradation
 * policy (P0-1): fail-closed for writes, in-memory fallback for reads.
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
