import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import { randomUUID } from 'node:crypto';
import healthRoutes from './routes/health.js';
import recordRoutes from './routes/records.js';
import { apiErrorHandler } from './utils/errors.js';
import { registerRateLimit } from './middleware/rateLimit.js';
import { client } from './db/index.js';

/**
 * Res ex Machina — API Server
 *
 * Entry point principal de la aplicación.
 * Registra todas las rutas bajo el prefijo /v1.
 */

const app = Fastify({
    logger: {
        level: process.env.LOG_LEVEL || 'info',
        transport:
            process.env.NODE_ENV === 'development'
                ? { target: 'pino-pretty', options: { colorize: true } }
                : undefined,
    },
    // Límite de body request (64KB según error catalog)
    bodyLimit: 64 * 1024,
    // Generar request_id único para trazabilidad
    genReqId: () => randomUUID(),
    // Desactivar header X-Powered-By
    disableRequestLogging: false,
});

// --- Logs estructurados: añadir wallet y record_id a los logs ---
app.addHook('onRequest', async (request) => {
    // Añadir request_id al header de respuesta para debugging del cliente
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

    // Extraer wallet del body si es POST /records
    if (request.method === 'POST' && request.url.includes('/records')) {
        const body = request.body as { pog_bundle?: { agent_wallet?: string } } | undefined;
        if (body?.pog_bundle?.agent_wallet) {
            logData.wallet = body.pog_bundle.agent_wallet.toLowerCase();
        }
    }

    // Log con nivel apropiado según status code
    if (reply.statusCode >= 500) {
        request.log.error(logData, 'request completed with error');
    } else if (reply.statusCode >= 400) {
        request.log.warn(logData, 'request completed with client error');
    } else {
        request.log.info(logData, 'request completed');
    }
});

// --- Security headers (Helmet) ---
await app.register(helmet, {
    contentSecurityPolicy: false,
});

// --- CORS ---
await app.register(cors, {
    origin: process.env.NODE_ENV === 'production'
        ? false
        : true,
    methods: ['GET', 'POST'],
});

// --- Error handler global ---
app.setErrorHandler(apiErrorHandler);

// --- Rate limiting ---
await registerRateLimit(app);

// --- INV-001: DELETE no permitido (405 Method Not Allowed) ---
app.delete('/v1/records/:id', async (_request, reply) => {
    return reply.status(405).send({
        error: {
            code: 'method_not_allowed',
            message: 'Records are permanent and cannot be deleted (INV-001)',
        },
    });
});

// --- Registrar rutas bajo /v1 ---
app.register(healthRoutes, { prefix: '/v1' });
app.register(recordRoutes, { prefix: '/v1/records' });

// --- Ruta raíz ---
app.get('/', async () => {
    return {
        name: 'Res ex Machina',
        description: 'Registro neutral y automatizado de hechos de generación por IA',
        version: 'v1',
        docs: '/v1/health',
    };
});

// --- Arrancar servidor ---
const PORT = parseInt(process.env.PORT || '3000', 10);

const start = async () => {
    try {
        await app.listen({ port: PORT, host: '0.0.0.0' });
        app.log.info(`⚖️  Res ex Machina API listening on port ${PORT}`);

        // En producción, arrancar el worker de anchoring en el mismo proceso.
        // En desarrollo se ejecuta aparte con `npm run worker:anchor`.
        // Import dinámico para evitar conexión Redis al cargar el módulo en tests.
        if (process.env.NODE_ENV === 'production') {
            await import('./workers/anchor.worker.js');
            app.log.info('⚓ Anchor worker iniciado (inline, mismo proceso)');
        }
    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
};

// --- Graceful shutdown (Q-2) ---
// Al recibir SIGTERM (deploy) o SIGINT (Ctrl+C):
// 1. Fastify deja de aceptar requests nuevas y espera a las activas
// 2. Cierra la cola BullMQ (no acepta nuevos jobs)
// 3. Cierra el pool de conexiones PostgreSQL
async function shutdown(signal: string) {
    app.log.info(`🛑 ${signal} recibido — iniciando shutdown graceful...`);

    try {
        // 1. Cerrar Fastify (drena requests activas)
        await app.close();
        app.log.info('✅ Fastify cerrado (requests drenadas)');

        // 2. Cerrar cola BullMQ (import dinámico para evitar conexión Redis al cargar el módulo)
        const { anchorQueue } = await import('./services/queue.js');
        await anchorQueue.close();
        app.log.info('✅ Cola de anchoring cerrada');

        // 3. Cerrar pool de PostgreSQL
        await client.end();
        app.log.info('✅ Conexión PostgreSQL cerrada');

        app.log.info('👋 Shutdown completo — saliendo');
        process.exit(0);
    } catch (err) {
        app.log.error(err, '❌ Error durante shutdown');
        process.exit(1);
    }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();

export default app;
