// SPDX-License-Identifier: Apache-2.0

import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createRateLimitRedisClient } from '../config/redis.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Rate limiting with Redis + degradation policy (P0-1 Remediation).
 *
 * Design decisions (CTO-approved):
 * - Redis is the primary store for distributed rate limiting.
 * - `skipOnError: false` — the rate limiter NEVER silently disables.
 * - When Redis fails, behavior depends on `RATE_LIMIT_*_ON_REDIS_DOWN`:
 *   - GET endpoints: fallback to in-memory (conservative, per-instance)
 *   - POST/write endpoints: 503 Service Unavailable in production,
 *     or in-memory strict fallback if explicitly configured.
 * - In-memory fallback is NOT equivalent to Redis (per-instance counters).
 *   It's a degraded mode that prioritizes security over accuracy.
 *
 * Configuration:
 *   RATE_LIMIT_READ_ON_REDIS_DOWN  = 'local_fallback' (default)
 *   RATE_LIMIT_WRITE_ON_REDIS_DOWN = '503' (default) | 'local_fallback'
 *
 * References: PRD v1.1, Threat Model D-01/D-03, Audit H-01, CTO Review 2026-05-15
 */

// ─── Configuration ─────────────────────────────────────────────

type RedisDownPolicy = '503' | 'local_fallback';

const WRITE_POLICY: RedisDownPolicy =
    (process.env.RATE_LIMIT_WRITE_ON_REDIS_DOWN as RedisDownPolicy) || '503';
const READ_POLICY: RedisDownPolicy =
    (process.env.RATE_LIMIT_READ_ON_REDIS_DOWN as RedisDownPolicy) || 'local_fallback';

// Conservative limits for in-memory fallback (per-instance, so intentionally lower)
const FALLBACK_READ_MAX = 30;     // 30 req/min for GET (conservative)
const FALLBACK_WRITE_MAX = 5;     // 5 req/min for POST (very strict)

// Normal Redis-backed limits
const GLOBAL_READ_MAX = 100;      // 100 req/min for GET
const GLOBAL_WRITE_MAX = 10;      // 10 req/min for POST

// ─── Redis health tracking ─────────────────────────────────────

let redisHealthy = true;
let rateLimitRedis: ReturnType<typeof createRateLimitRedisClient> | null = null;

function getRateLimitRedis() {
    if (!rateLimitRedis) {
        rateLimitRedis = createRateLimitRedisClient();

        rateLimitRedis.on('error', (err) => {
            if (redisHealthy) {
                logger.warn({ err: err.message }, 'Rate limit Redis DOWN — activating degradation policy');
                redisHealthy = false;
            }
        });

        rateLimitRedis.on('connect', () => {
            if (!redisHealthy) {
                logger.info('Rate limit Redis RECOVERED — returning to normal operation');
                redisHealthy = true;
            }
        });
    }
    return rateLimitRedis;
}

// ─── Write endpoint detection ──────────────────────────────────

const WRITE_ROUTE_PREFIXES = [
    '/v1/records',   // POST /v1/records, POST /v1/records/batch
    '/v1/webhooks',  // POST /v1/webhooks (webhook registration)
];

function isWriteRequest(request: FastifyRequest): boolean {
    if (request.method !== 'POST' && request.method !== 'PUT' && request.method !== 'PATCH' && request.method !== 'DELETE') {
        return false;
    }
    return WRITE_ROUTE_PREFIXES.some(prefix => request.url.startsWith(prefix));
}

// ─── Registration ──────────────────────────────────────────────

export async function registerRateLimit(app: FastifyInstance): Promise<void> {
    const redis = getRateLimitRedis();

    // Global rate limit (covers all endpoints)
    await app.register(rateLimit, {
        global: true,
        max: (request: FastifyRequest, _key: string) => {
            const write = isWriteRequest(request);

            // If Redis is down, apply degradation policy
            if (!redisHealthy) {
                if (write) {
                    if (WRITE_POLICY === '503') {
                        // Fail-closed: reject all write requests when Redis is down
                        return 0; // max=0 → immediately rate-limited
                    }
                    // local_fallback mode: very strict in-memory limit
                    return FALLBACK_WRITE_MAX;
                }
                // Read requests: conservative in-memory fallback
                return FALLBACK_READ_MAX;
            }

            // Redis healthy: normal limits
            return write ? GLOBAL_WRITE_MAX : GLOBAL_READ_MAX;
        },
        timeWindow: '1 minute',
        redis,
        nameSpace: 'rxm-rl:',
        // H-01 FIX: Never skip rate limiting on Redis errors.
        // Instead, redisHealthy flag triggers degradation policy above.
        skipOnError: false,
        hook: 'onRequest',
        onExceeded: (_request, key) => {
            logger.warn({ key, redisHealthy }, 'Rate limit exceeded');
        },
        onBanReach: (_request, key) => {
            logger.warn({ key, redisHealthy }, 'Rate limit ban reached');
        },
        keyGenerator: (request) => {
            return request.ip;
        },
        errorResponseBuilder: (request, context) => {
            const write = isWriteRequest(request);

            // If Redis is down and write policy is 503, return service unavailable
            if (!redisHealthy && write && WRITE_POLICY === '503') {
                return {
                    statusCode: 503,
                    error: {
                        code: 'service_degraded',
                        message: 'Write operations temporarily unavailable due to infrastructure degradation. Read operations remain available.',
                        details: {
                            retry_after: '60',
                        },
                    },
                };
            }

            return {
                error: {
                    code: 'rate_limit_exceeded',
                    message: `Too many requests. Limit: ${context.max} per ${context.after}`,
                    details: {
                        limit: context.max,
                        remaining: 0,
                        reset: context.after,
                        degraded: !redisHealthy,
                    },
                },
            };
        },
    });

    // Health endpoint should never be aggressively rate-limited
    app.addHook('onRoute', (routeOptions) => {
        if (routeOptions.url === '/health' || routeOptions.url === '/v1/health') {
            routeOptions.config = {
                ...routeOptions.config,
                rateLimit: { max: 300, timeWindow: '1 minute' },
            };
        }
    });

    logger.info({
        writePolicy: WRITE_POLICY,
        readPolicy: READ_POLICY,
        globalReadMax: GLOBAL_READ_MAX,
        globalWriteMax: GLOBAL_WRITE_MAX,
        fallbackReadMax: FALLBACK_READ_MAX,
        fallbackWriteMax: FALLBACK_WRITE_MAX,
    }, 'Rate limiting registered with degradation policy');
}

/**
 * Exposes Redis health status for monitoring/testing.
 */
export function isRateLimitRedisHealthy(): boolean {
    return redisHealthy;
}
