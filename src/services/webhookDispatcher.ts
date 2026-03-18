import { Queue, Worker, type Job } from 'bullmq';
import { createHmac, randomUUID } from 'node:crypto';
import { redisConnectionConfig } from '../config/redis.js';
import { db } from '../db/index.js';
import { webhooks } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

/**
 * Webhook Dispatcher — Asynchronous webhook delivery service (Issue #13).
 *
 * Design:
 * - BullMQ queue `webhook_dispatch` (doesn't block anchoring)
 * - HMAC-SHA256 for payload authentication
 * - 3 retries with backoff: 5s → 30s → 120s
 * - 5s timeout per HTTP request
 * - No redirect following (SSRF mitigation)
 * - delivery_id + attempt for deduplication
 */

// --- Cola BullMQ ---

export const webhookQueue = new Queue('webhook_dispatch', {
    connection: redisConnectionConfig,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'custom',
        },
        removeOnComplete: 200,
        removeOnFail: 500,
    },
});

/** Webhook job data */
export interface WebhookJobData {
    webhookId: string;
    url: string;
    secret: string;
    deliveryId: string;
    payload: WebhookPayload;
}

/** Webhook payload */
export interface WebhookPayload {
    delivery_id: string;
    attempt: number;
    event: 'state_changed';
    timestamp: string;
    data: {
        record_id: string;
        old_state: string;
        new_state: string;
        anchor_tx_hash?: string;
        anchor_block?: number;
        anchor_chain_id?: number;
    };
}

/**
 * Enqueues webhook jobs for all active subscriptions of the wallet.
 * Called from anchor.ts after changing the record state.
 * Is async and does not block the anchoring flow.
 */
export async function enqueueWebhookDispatch(
    agentWallet: string,
    recordId: string,
    oldState: string,
    newState: string,
    anchorData?: { txHash?: string; block?: number; chainId?: number },
): Promise<void> {
    // Find active webhooks for this wallet
    const activeWebhooks = await db
        .select()
        .from(webhooks)
        .where(and(
            eq(webhooks.agentWallet, agentWallet.toLowerCase()),
            eq(webhooks.active, true),
        ));

    if (activeWebhooks.length === 0) return;

    const now = new Date().toISOString();

    for (const webhook of activeWebhooks) {
        const deliveryId = randomUUID();

        const payload: WebhookPayload = {
            delivery_id: deliveryId,
            attempt: 1,
            event: 'state_changed',
            timestamp: now,
            data: {
                record_id: recordId,
                old_state: oldState,
                new_state: newState,
                ...(anchorData?.txHash && { anchor_tx_hash: anchorData.txHash }),
                ...(anchorData?.block && { anchor_block: anchorData.block }),
                ...(anchorData?.chainId && { anchor_chain_id: anchorData.chainId }),
            },
        };

        await webhookQueue.add(
            'deliver-webhook',
            {
                webhookId: webhook.webhookId,
                url: webhook.url,
                secret: webhook.secret,
                deliveryId,
                payload,
            } satisfies WebhookJobData,
            { jobId: `wh-${webhook.webhookId}-${deliveryId}` },
        );
    }
}

/**
 * Generates HMAC-SHA256 signature of the payload.
 */
export function signPayload(secret: string, body: string): string {
    return createHmac('sha256', secret).update(body).digest('hex');
}

/**
 * Executes a webhook delivery.
 * HTTPS fetch with 5s timeout, no redirects.
 */
export async function executeWebhookDelivery(job: Job<WebhookJobData>): Promise<void> {
    const { url, secret, payload } = job.data;

    // Update attempt in the payload
    const currentPayload = { ...payload, attempt: job.attemptsMade + 1 };
    const body = JSON.stringify(currentPayload);
    const signature = signPayload(secret, body);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-RxM-Signature': `sha256=${signature}`,
                'X-RxM-Delivery-Id': currentPayload.delivery_id,
                'User-Agent': 'ResExMachina-Webhook/1.0',
            },
            body,
            signal: controller.signal,
            redirect: 'error', // Don't follow redirects (SSRF)
        });

        if (!response.ok) {
            throw new Error(`Webhook delivery failed: HTTP ${response.status}`);
        }
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * Calculates custom backoff for retries: 5s → 30s → 120s.
 */
function customBackoff(attemptsMade: number): number {
    const delays = [5000, 30000, 120000];
    return delays[attemptsMade - 1] ?? 120000;
}

/**
 * Webhook dispatch worker.
 * Dynamically imported in production (same as the anchor worker).
 */
export function createWebhookWorker(): Worker<WebhookJobData> {
    return new Worker<WebhookJobData>(
        'webhook_dispatch',
        async (job) => {
            console.log(`📬 Delivering webhook ${job.data.deliveryId} (attempt ${job.attemptsMade + 1})`);
            await executeWebhookDelivery(job);
            console.log(`✅ Webhook delivered: ${job.data.deliveryId}`);
        },
        {
            connection: redisConnectionConfig,
            concurrency: 5,
            settings: {
                backoffStrategy: customBackoff,
            },
        },
    );
}
