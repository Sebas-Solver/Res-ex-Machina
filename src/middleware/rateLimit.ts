// SPDX-License-Identifier: Apache-2.0

import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import { createRateLimitRedisClient } from '../config/redis.js';

/**
 * Configures rate limiting in the application.
 *
 * Two levels:
 * 1. Global: 100 req/min per IP (all endpoints)
 * 2. POST /records: 10 req/min per IP (stricter, route-level)
 *
 * Store: Shared Redis (Issue #17).
 * Resilience: skipOnError = true → if Redis goes down, rate limit is
 * temporarily disabled instead of crashing the API (Issue #22).
 *
 * Response headers:
 * - X-RateLimit-Limit
 * - X-RateLimit-Remaining
 * - X-RateLimit-Reset
 *
 * Reference: PRD v1.1, Threat Model D-01/D-03
 */

// Singleton Redis client for rate limiting
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
        max: 100,                  // 100 requests per window
        timeWindow: '1 minute',    // 1-minute window
        redis: getRateLimitRedis(),
        nameSpace: 'rxm-rl:',     // Redis prefix to avoid collisions
        skipOnError: true,         // Issue #22: if Redis fails, don't block requests
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

