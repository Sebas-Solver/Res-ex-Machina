// SPDX-License-Identifier: Apache-2.0

import type { FastifyInstance } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { db } from '../db/index.js';
import { sql } from 'drizzle-orm';
import { createHealthRedisClient } from '../config/redis.js';
import { publicClient as l2HealthClient } from '../config/blockchain.js';

/**
 * Health check — GET /v1/health
 *
 * L-03: Two-tier response:
 * - Public:  { status, version, timestamp } (no infra details)
 * - Admin:   Full diagnostics with latencies and block number
 *            (requires X-Admin-Key header)
 */

// --- Cliente Redis singleton para health check ---

let redisClient: ReturnType<typeof createHealthRedisClient> | null = null;

function getRedisClient() {
    if (!redisClient) {
        redisClient = createHealthRedisClient();
        redisClient.on('error', () => {
            redisClient?.disconnect();
            redisClient = null;
        });
    }
    return redisClient;
}

// --- Health cache (Issue #16) ---
const HEALTH_CACHE_TTL_MS = 30_000;
let cachedHealth: { body: Record<string, unknown>; statusCode: number } | null = null;
let cachedAt = 0;

/**
 * Timing-safe admin key check for health endpoint.
 * Returns true if key matches, false otherwise.
 */
function isAdminAuthenticated(headerValue: string | string[] | undefined, adminKey: string | undefined): boolean {
    if (!adminKey || !headerValue || typeof headerValue !== 'string') return false;
    if (headerValue.length !== adminKey.length) return false;
    try {
        return timingSafeEqual(Buffer.from(headerValue), Buffer.from(adminKey));
    } catch {
        return false;
    }
}

// --- Routes ---

export default async function healthRoutes(app: FastifyInstance): Promise<void> {
    app.get('/health', async (request, reply) => {
        // Return cache if valid
        const now = Date.now();
        if (cachedHealth && (now - cachedAt) < HEALTH_CACHE_TTL_MS) {
            return reply
                .status(cachedHealth.statusCode)
                .header('Cache-Control', 'public, max-age=30')
                .header('X-Cache', 'HIT')
                .send(cachedHealth.body);
        }

        const checks = await Promise.allSettled([
            checkDatabase(),
            checkRedis(),
            checkBlockchain(),
        ]);

        const dbStatus = checks[0].status === 'fulfilled' ? checks[0].value : { status: 'error', error: formatError(checks[0].reason) };
        const redisStatus = checks[1].status === 'fulfilled' ? checks[1].value : { status: 'error', error: formatError(checks[1].reason) };
        const l2Status = checks[2].status === 'fulfilled' ? checks[2].value : { status: 'error', error: formatError(checks[2].reason) };

        const allHealthy = dbStatus.status === 'ok' && redisStatus.status === 'ok' && l2Status.status === 'ok';
        const statusCode = allHealthy ? 200 : 503;

        // L-03: Check if requester is admin (has valid X-Admin-Key)
        const adminKey = process.env.ADMIN_API_KEY;
        const isAdmin = isAdminAuthenticated(request.headers['x-admin-key'], adminKey);

        // Build response — detailed info only for admins
        const body: Record<string, unknown> = {
            status: allHealthy ? 'ok' : 'degraded',
            version: 'v1',
            timestamp: new Date().toISOString(),
        };

        if (isAdmin) {
            // Full diagnostics for admin
            body.checks = {
                database: dbStatus,
                redis: redisStatus,
                blockchain: l2Status,
            };
        }

        // Guardar en cache
        cachedHealth = { body, statusCode };
        cachedAt = now;

        const headers: Record<string, string> = {
            'Cache-Control': 'public, max-age=30',
            'X-Cache': 'MISS',
        };

        if (statusCode === 503) {
            headers['Retry-After'] = '30';
        }

        return reply
            .status(statusCode)
            .headers(headers)
            .send(body);
    });
}

// --- Check functions ---

async function checkDatabase(): Promise<{ status: string; latencyMs: number }> {
    const start = Date.now();
    await db.execute(sql`SELECT 1`);
    return { status: 'ok', latencyMs: Date.now() - start };
}

async function checkRedis(): Promise<{ status: string; latencyMs: number }> {
    const start = Date.now();
    const client = getRedisClient();
    if (client.status !== 'ready') {
        await client.connect();
    }
    await client.ping();
    return { status: 'ok', latencyMs: Date.now() - start };
}

async function checkBlockchain(): Promise<{ status: string; latencyMs: number; blockNumber?: number }> {
    const start = Date.now();
    const blockNumber = await l2HealthClient.getBlockNumber();
    return {
        status: 'ok',
        latencyMs: Date.now() - start,
        blockNumber: Number(blockNumber),
    };
}

function formatError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
