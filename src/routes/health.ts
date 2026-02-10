import type { FastifyInstance } from 'fastify';

/**
 * Rutas de health check — GET /v1/health
 *
 * La implementación completa se hará en el Issue #7.
 * Por ahora devuelve un health check básico para verificar que el servidor funciona.
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
    app.get('/health', async (_request, _reply) => {
        return {
            status: 'ok',
            version: 'v1',
            timestamp: new Date().toISOString(),
        };
    });
}
