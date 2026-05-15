// SPDX-License-Identifier: Apache-2.0

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
import { encryptSecret } from '../services/secretCrypto.js';

/**
 * Webhook Routes — Issue #13
 *
 * Endpoints to manage state change notification webhooks.
 * All endpoints require EIP-191 signature authentication (walletAuth).
 *
 * Security:
 * - HTTPS only (SSRF mitigation)
 * - Server-generated secret (32 bytes hex)
 * - Maximum 5 webhooks per wallet
 * - Real signature authentication
 */

/** Maximum active webhooks per wallet */
const MAX_WEBHOOKS_PER_WALLET = 5;

export default async function webhookRoutes(fastify: FastifyInstance): Promise<void> {

    // =============================================
    // POST /v1/webhooks — Register webhook
    // =============================================

    fastify.post('/', {
        preHandler: walletAuth,
    }, async (request, reply) => {
        const wallet = request.authenticatedWallet!;

        // 1. Validate body with Zod
        const parsed = createWebhookSchema.safeParse(request.body);
        if (!parsed.success) {
            throw new ApiError(400, 'invalid_webhook_payload', parsed.error.issues[0]?.message ?? 'Invalid webhook payload');
        }

        const { url, events } = parsed.data;

        // 2. Validate URL against SSRF
        try {
            await validateWebhookUrl(url);
        } catch (err) {
            throw webhookInvalidUrl({
                reason: err instanceof Error ? err.message : 'URL validation failed',
            });
        }

        // 3. Check webhook limit per wallet
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

        // 4. Generate secret (32 bytes hex = 64 chars)
        const secret = randomBytes(32).toString('hex');

        // 5. Create webhook
        const webhookId = randomUUID();
        const encrypted = encryptSecret(secret, webhookId, wallet);

        await db.insert(webhooks).values({
            webhookId,
            agentWallet: wallet,
            url,
            secret: null, // P1-1: Plaintext secret is null for new webhooks
            secretCiphertext: encrypted.ciphertext,
            secretIv: encrypted.iv,
            secretAuthTag: encrypted.authTag,
            secretKeyVersion: encrypted.keyVersion,
            events,
            active: true,
        });

        // 6. Return webhook WITH secret (only time it's shown)
        return reply.status(201).send({
            webhook_id: webhookId,
            url,
            events,
            active: true,
            secret, // ⚠️ Only shown this one time
            created_at: new Date().toISOString(),
            _warning: 'Save the secret now. It will not be shown again.',
        });
    });

    // =============================================
    // GET /v1/webhooks — List own webhooks
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
                // ⚠️ Secret is NOT returned
            })),
            total: results.length,
        };
    });

    // =============================================
    // DELETE /v1/webhooks/:id — Delete webhook
    // =============================================

    fastify.delete<{ Params: { id: string } }>('/:id', {
        preHandler: walletAuth,
    }, async (request, reply) => {
        const wallet = request.authenticatedWallet!;
        const { id } = request.params;

        // Find webhook
        const [webhook] = await db
            .select()
            .from(webhooks)
            .where(eq(webhooks.webhookId, id))
            .limit(1);

        if (!webhook) {
            throw webhookNotFound();
        }

        // Only the owner can delete
        if (webhook.agentWallet.toLowerCase() !== wallet) {
            throw webhookForbidden();
        }

        // Deactivate (soft delete for audit trail)
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
