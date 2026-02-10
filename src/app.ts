import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import healthRoutes from './routes/health.js';
import recordRoutes from './routes/records.js';
import { apiErrorHandler } from './utils/errors.js';
import { registerRateLimit } from './middleware/rateLimit.js';

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
});

// --- Security headers (Helmet) ---
await app.register(helmet, {
    // CSP no es necesario para una API JSON
    contentSecurityPolicy: false,
});

// --- CORS ---
await app.register(cors, {
    origin: process.env.NODE_ENV === 'production'
        ? false // Deshabilitar en producción (API solo server-to-server)
        : true,  // Permitir en desarrollo
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
        console.log(`\n⚖️  Res ex Machina API listening on port ${PORT}\n`);
    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
};

start();

export default app;
