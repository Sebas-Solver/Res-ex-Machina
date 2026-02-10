import Fastify from 'fastify';
import { healthRoutes } from './routes/health.js';
import { recordsRoutes } from './routes/records.js';

/**
 * Res ex Machina — API Server
 *
 * Entry point principal de la aplicación.
 * Registra todas las rutas bajo el prefijo /v1.
 *
 * La configuración de entorno (env.ts) se carga bajo demanda
 * en los módulos que la necesitan, no aquí, para permitir
 * arrancar el servidor sin DB/Redis durante scaffolding.
 */

const app = Fastify({
    logger: {
        level: process.env.LOG_LEVEL || 'info',
        transport:
            process.env.NODE_ENV === 'development'
                ? { target: 'pino-pretty', options: { colorize: true } }
                : undefined,
    },
});

// --- Registrar rutas bajo /v1 ---
app.register(healthRoutes, { prefix: '/v1' });
app.register(recordsRoutes, { prefix: '/v1' });

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
