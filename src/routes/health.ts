import type { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { sql } from 'drizzle-orm';
import { createPublicClient, http } from 'viem';
import { Redis } from 'ioredis';
import { env } from '../config/env.js';

/**
 * Health check detallado — GET /v1/health
 *
 * Verifica el estado de las 3 dependencias:
 * - PostgreSQL (query SELECT 1)
 * - Redis (PING via ioredis)
 * - L2 blockchain (getBlockNumber)
 *
 * Devuelve status por componente para diagnóstico rápido.
 *
 * Redis y blockchain reutilizan clientes singleton para evitar
 * crear conexiones nuevas en cada llamada (importante para liveness probes).
 */

// --- Clientes singleton (se crean una sola vez) ---

let redisClient: Redis | null = null;

function getRedisClient(): Redis {
    if (!redisClient) {
        const redisUrl = new URL(env.REDIS_URL);
        redisClient = new Redis({
            host: redisUrl.hostname,
            port: parseInt(redisUrl.port || '6379', 10),
            password: redisUrl.password || undefined,
            tls: redisUrl.protocol === 'rediss:' ? {} : undefined,
            maxRetriesPerRequest: 1,
            connectTimeout: 3000,
            lazyConnect: true,
        });

        // Si la conexión se pierde, invalidar para recrear en el próximo check
        redisClient.on('error', () => {
            redisClient?.disconnect();
            redisClient = null;
        });
    }
    return redisClient;
}

const l2HealthClient = createPublicClient({
    transport: http(env.L2_RPC_URL),
});

// --- Routes ---

export default async function healthRoutes(app: FastifyInstance): Promise<void> {
    app.get('/health', async (_request, reply) => {
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

        return reply.status(statusCode).send({
            status: allHealthy ? 'ok' : 'degraded',
            version: 'v1',
            timestamp: new Date().toISOString(),
            checks: {
                database: dbStatus,
                redis: redisStatus,
                blockchain: l2Status,
            },
        });
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
