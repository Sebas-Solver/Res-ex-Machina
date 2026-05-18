// SPDX-License-Identifier: Apache-2.0
// Issue #19: Sentry must be initialized BEFORE any other import
import { initMonitoring, Sentry } from './config/monitoring.js';
initMonitoring();

import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import { randomUUID } from 'node:crypto';
import healthRoutes from './routes/health.js';
import recordRoutes from './routes/records.js';
import webhookRoutes from './routes/webhooks.js';
import adminRoutes from './routes/admin.js';
import { apiErrorHandler } from './utils/errors.js';
import { registerRateLimit } from './middleware/rateLimit.js';
import { client } from './db/index.js';

/**
 * Res ex Machina — API Server
 *
 * Main application entry point.
 * Registers all routes under the /v1 prefix.
 */

const app = Fastify({
    logger: {
        level: process.env.LOG_LEVEL || 'info',
        transport:
            process.env.NODE_ENV === 'development'
                ? { target: 'pino-pretty', options: { colorize: true } }
                : undefined,
    },
    // Request body limit (64KB per error catalog)
    bodyLimit: 64 * 1024,
    // Generate unique request_id for traceability
    genReqId: () => randomUUID(),
    // Disable X-Powered-By header
    disableRequestLogging: false,
});

// --- Structured logs: add wallet and record_id to logs ---
app.addHook('onRequest', async (request) => {
    // Add request_id to response header for client debugging
    request.raw.headers['x-request-id'] = request.id;
});

app.addHook('onResponse', async (request, reply) => {
    const logData: Record<string, unknown> = {
        request_id: request.id,
        method: request.method,
        url: request.url,
        status_code: reply.statusCode,
        response_time_ms: reply.elapsedTime,
    };

    // Extract wallet from body if POST /records (truncated for privacy)
    if (request.method === 'POST' && request.url.includes('/records')) {
        const body = request.body as { pog_bundle?: { agent_wallet?: string } } | undefined;
        const wallet = body?.pog_bundle?.agent_wallet?.toLowerCase();
        if (wallet && wallet.length >= 10) {
            logData.wallet = `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
        }
    }

    // Log with appropriate level based on status code
    if (reply.statusCode >= 500) {
        request.log.error(logData, 'request completed with error');
    } else if (reply.statusCode >= 400) {
        request.log.warn(logData, 'request completed with client error');
    } else {
        request.log.info(logData, 'request completed');
    }
});

// --- Security headers (Helmet) ---
// M-05: CSP enabled. RxM is a JSON API, so we use a strict policy.
// The admin dashboard (if serving HTML) would need its own override.
await app.register(helmet, {
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"], // Admin dashboard inline styles
            imgSrc: ["'self'", 'data:'],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            frameSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
        },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
});

// --- CORS ---
await app.register(cors, {
    origin: process.env.NODE_ENV === 'production'
        ? [
            /\.github\.io$/,                          // GitHub Pages status page
            'https://sebas-solver.github.io',         // Status page exact origin
            ...(process.env.CORS_ALLOWED_ORIGINS
                ? process.env.CORS_ALLOWED_ORIGINS.split(',')
                : []),
        ]
        : true,
    methods: ['GET', 'POST', 'DELETE'],
});

// --- Global error handler ---
app.setErrorHandler(apiErrorHandler);

// --- Rate limiting ---
await registerRateLimit(app);

// --- INV-001: DELETE not allowed (405 Method Not Allowed) ---
app.delete('/v1/records/:id', async (_request, reply) => {
    return reply.status(405).send({
        error: {
            code: 'method_not_allowed',
            message: 'Records are permanent and cannot be deleted (INV-001)',
        },
    });
});

// --- Register routes under /v1 ---
app.register(healthRoutes, { prefix: '/v1' });
app.register(recordRoutes, { prefix: '/v1/records' });
app.register(webhookRoutes, { prefix: '/v1/webhooks' });
app.register(adminRoutes, { prefix: '/admin' });

// --- Root route ---
app.get('/', async () => {
    return {
        name: 'Res ex Machina',
        description: 'Neutral and automated registry of AI generation events',
        version: 'v1',
        docs: '/v1/health',
    };
});

// --- Start server ---
const PORT = parseInt(process.env.PORT || '3000', 10);

const start = async () => {
    try {
        await app.listen({ port: PORT, host: '0.0.0.0' });
        app.log.info(`⚖️  Res ex Machina API listening on port ${PORT}`);

        // In production, start the anchoring worker in the same process by default.
        // If START_INLINE_WORKER=false, the worker will NOT start here, and should be run 
        // separately via `npm run worker:anchor` for better horizontal scaling.
        if (process.env.NODE_ENV === 'production' && process.env.START_INLINE_WORKER !== 'false') {
            try {
                await import('./workers/anchor.worker.js');
                app.log.info('⚓ Anchor worker started (inline, same process)');
                
                const { startWebhookWorker } = await import('./workers/webhook.worker.js');
                startWebhookWorker();
                app.log.info('🚀 Webhook dispatch worker started (inline, same process)');
            } catch (workerErr) {
                app.log.error(workerErr, '❌ Worker(s) failed to start (Redis available?)');
                // Don't process.exit — the API can work without the worker,
                // jobs will be processed when the worker becomes available.
            }
        } else if (process.env.NODE_ENV === 'production' && process.env.START_INLINE_WORKER === 'false') {
            app.log.info('⚖️  Running in API-only mode (START_INLINE_WORKER=false). Remember to start the worker separately.');
        }
    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
};

// --- Graceful shutdown (Q-2) ---
// On receiving SIGTERM (deploy) or SIGINT (Ctrl+C):
// 1. Fastify stops accepting new requests and waits for active ones
// 2. Closes the BullMQ queue (no new jobs accepted)
// 3. Closes the PostgreSQL connection pool
async function shutdown(signal: string) {
    app.log.info(`🛑 ${signal} received — starting graceful shutdown...`);

    try {
        // 1. Close Fastify (drains active requests)
        await app.close();
        app.log.info('✅ Fastify closed (requests drained)');

        // 2. Close BullMQ queues (dynamic import to avoid Redis connection on module load)
        const { anchorQueue } = await import('./services/queue.js');
        await anchorQueue.close();
        app.log.info('✅ Anchoring queue closed');

        const { webhookQueue } = await import('./services/webhookDispatcher.js');
        await webhookQueue.close();
        app.log.info('✅ Webhook dispatch queue closed');

        if (process.env.NODE_ENV === 'production' && process.env.START_INLINE_WORKER !== 'false') {
            const { stopWebhookWorker } = await import('./workers/webhook.worker.js');
            await stopWebhookWorker();
        }

        // 3. Close PostgreSQL pool
        await client.end();
        app.log.info('✅ PostgreSQL connection closed');

        app.log.info('👋 Shutdown complete — exiting');
        process.exit(0);
    } catch (err) {
        app.log.error(err, '❌ Error during shutdown');
        process.exit(1);
    }
}

// --- Process crash handlers (P0-2: audit findings) ---
// Guard: prevent duplicate listeners if app.ts is imported multiple times in tests.
const CRASH_HANDLERS_KEY = '__rxm_crash_handlers__';
if (!(globalThis as Record<string, unknown>)[CRASH_HANDLERS_KEY]) {
    (globalThis as Record<string, unknown>)[CRASH_HANDLERS_KEY] = true;

    process.on('unhandledRejection', (reason) => {
        app.log.error({ reason }, '💀 Unhandled rejection — starting shutdown');
        try { Sentry.captureException(reason); } catch { /* Sentry best-effort */ }
        shutdown('unhandledRejection');
    });

    process.on('uncaughtException', (error) => {
        app.log.error({ error }, '💀 Uncaught exception — exiting immediately');
        try { Sentry.captureException(error); } catch { /* Sentry best-effort */ }
        process.exit(1);
    });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();

export default app;
