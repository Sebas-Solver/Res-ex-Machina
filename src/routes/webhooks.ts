import type { FastifyInstance } from 'fastify';
import { randomUUID, randomBytes } from 'node:crypto';
import { db } from '../db/index.js';
import { webhooks } from '../db/schema.js';
import { eq, and, count } from 'drizzle-orm';
import { walletAuth } from '../middleware/walletAuth.js';
import { createWebhookSchema } from './schemas/webhookSchema.js';
import { validateWebhookUrl } from '../utils/urlValidator.js';
import {
    webhookNotFound,
    webhookLimitReached,
    webhookInvalidUrl,
    webhookForbidden,
} from '../utils/errors.js';
import { ApiError } from '../utils/errors.js';

/**
 * Webhook Routes — Issue #13
 *
 * Endpoints para gestionar webhooks de notificación de cambios de estado.
 * Todos los endpoints requieren autenticación por firma EIP-191 (walletAuth).
 *
 * Seguridad:
 * - Solo HTTPS (SSRF mitigation)
 * - Secret generado por servidor (32 bytes hex)
 * - Máximo 5 webhooks por wallet
 * - Autenticación real por firma
 */

/** Máximo de webhooks activos por wallet */
const MAX_WEBHOOKS_PER_WALLET = 5;

export default async function webhookRoutes(fastify: FastifyInstance): Promise<void> {

    // =============================================
    // POST /v1/webhooks — Registrar webhook
    // =============================================

    fastify.post('/', {
        preHandler: walletAuth,
    }, async (request, reply) => {
        const wallet = request.authenticatedWallet!;

        // 1. Validar body con Zod
        const parsed = createWebhookSchema.safeParse(request.body);
        if (!parsed.success) {
            throw new ApiError(400, 'invalid_webhook_payload', parsed.error.issues[0]?.message ?? 'Invalid webhook payload');
        }

        const { url, events } = parsed.data;

        // 2. Validar URL contra SSRF
        try {
            await validateWebhookUrl(url);
        } catch (err) {
            throw webhookInvalidUrl({
                reason: err instanceof Error ? err.message : 'URL validation failed',
            });
        }

        // 3. Comprobar límite de webhooks por wallet
        const [countResult] = await db
            .select({ count: count() })
            .from(webhooks)
            .where(and(
                eq(webhooks.agentWallet, wallet),
                eq(webhooks.active, true),
            ));

        if ((countResult?.count ?? 0) >= MAX_WEBHOOKS_PER_WALLET) {
            throw webhookLimitReached();
        }

        // 4. Generar secret (32 bytes hex = 64 chars)
        const secret = randomBytes(32).toString('hex');

        // 5. Crear webhook
        const webhookId = randomUUID();

        await db.insert(webhooks).values({
            webhookId,
            agentWallet: wallet,
            url,
            secret,
            events,
            active: true,
        });

        // 6. Devolver webhook CON secret (única vez)
        return reply.status(201).send({
            webhook_id: webhookId,
            url,
            events,
            active: true,
            secret, // ⚠️ Solo se muestra esta vez
            created_at: new Date().toISOString(),
            _warning: 'Save the secret now. It will not be shown again.',
        });
    });

    // =============================================
    // GET /v1/webhooks — Listar webhooks propios
    // =============================================

    fastify.get('/', {
        preHandler: walletAuth,
    }, async (request, _reply) => {
        const wallet = request.authenticatedWallet!;

        const results = await db
            .select({
                webhookId: webhooks.webhookId,
                url: webhooks.url,
                events: webhooks.events,
                active: webhooks.active,
                createdAt: webhooks.createdAt,
            })
            .from(webhooks)
            .where(eq(webhooks.agentWallet, wallet));

        return {
            webhooks: results.map((w) => ({
                webhook_id: w.webhookId,
                url: w.url,
                events: w.events,
                active: w.active,
                created_at: w.createdAt?.toISOString(),
                // ⚠️ NO se devuelve el secret
            })),
            total: results.length,
        };
    });

    // =============================================
    // DELETE /v1/webhooks/:id — Eliminar webhook
    // =============================================

    fastify.delete<{ Params: { id: string } }>('/:id', {
        preHandler: walletAuth,
    }, async (request, reply) => {
        const wallet = request.authenticatedWallet!;
        const { id } = request.params;

        // Buscar webhook
        const [webhook] = await db
            .select()
            .from(webhooks)
            .where(eq(webhooks.webhookId, id))
            .limit(1);

        if (!webhook) {
            throw webhookNotFound();
        }

        // Solo el owner puede borrar
        if (webhook.agentWallet.toLowerCase() !== wallet) {
            throw webhookForbidden();
        }

        // Desactivar (soft delete para auditoría)
        await db
            .update(webhooks)
            .set({ active: false })
            .where(eq(webhooks.webhookId, id));

        return reply.status(200).send({
            webhook_id: id,
            deleted: true,
        });
    });
}
