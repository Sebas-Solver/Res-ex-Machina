import type { FastifyInstance } from 'fastify';

/**
 * Rutas de records — POST/GET /v1/records
 *
 * La implementación completa se hará en los Issues #3, #4, #5.
 * Este archivo es un placeholder que registra las rutas vacías.
 *
 * Endpoints:
 * - POST /records       → Issue #3 (registro) + Issue #4 (fee)
 * - GET  /records/:id   → Issue #5
 * - GET  /records/verify → Issue #5
 * - GET  /records/:id/export → Issue #5
 */
export async function recordsRoutes(app: FastifyInstance): Promise<void> {
    // TODO: Issue #3 — POST /records (registro con firma EIP-712)
    app.post('/records', async (_request, reply) => {
        reply.code(501).send({
            error: {
                code: 'not_implemented',
                message: 'POST /records aún no implementado (Issue #3)',
            },
        });
    });

    // TODO: Issue #5 — GET /records/:id
    app.get('/records/:id', async (_request, reply) => {
        reply.code(501).send({
            error: {
                code: 'not_implemented',
                message: 'GET /records/:id aún no implementado (Issue #5)',
            },
        });
    });

    // TODO: Issue #5 — GET /records/verify
    app.get('/records/verify', async (_request, reply) => {
        reply.code(501).send({
            error: {
                code: 'not_implemented',
                message: 'GET /records/verify aún no implementado (Issue #5)',
            },
        });
    });

    // TODO: Issue #5 — GET /records/:id/export
    app.get('/records/:id/export', async (_request, reply) => {
        reply.code(501).send({
            error: {
                code: 'not_implemented',
                message: 'GET /records/:id/export aún no implementado (Issue #5)',
            },
        });
    });
}
