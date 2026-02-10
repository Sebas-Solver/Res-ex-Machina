import Fastify from 'fastify';
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

// --- Error handler global ---
app.setErrorHandler(apiErrorHandler);

// --- Rate limiting ---
await registerRateLimit(app);

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
