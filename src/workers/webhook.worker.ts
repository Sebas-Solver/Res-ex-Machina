// SPDX-License-Identifier: Apache-2.0

import { Worker } from 'bullmq';
import { createWebhookWorker, type WebhookJobData } from '../services/webhookDispatcher.js';
import { logger } from '../utils/logger.js';
import { fileURLToPath } from 'node:url';

/**
 * BullMQ Webhook Dispatch Worker.
 *
 * Processes jobs from the 'webhook_dispatch' queue asynchronously.
 * Exports start and stop methods for explicit lifecycle management.
 */

let workerInstance: Worker<WebhookJobData> | null = null;

export function startWebhookWorker(): Worker<WebhookJobData> {
    if (workerInstance) {
        logger.info('⚠️ Webhook Worker is already running.');
        return workerInstance;
    }

    workerInstance = createWebhookWorker();

    workerInstance.on('completed', (job) => {
        logger.info({ jobId: job.id }, '🏁 Webhook job completed');
    });

    workerInstance.on('failed', (job, error) => {
        if (!job) return;
        
        const { webhookId, deliveryId } = job.data;
        const maxAttempts = job.opts.attempts ?? 3;

        logger.error({ 
            jobId: job.id, 
            webhookId,
            deliveryId,
            attempt: job.attemptsMade, 
            maxAttempts, 
            error: error.message 
        }, '💀 Webhook job failed');
    });

    workerInstance.on('error', (error) => {
        logger.error({ error }, 'Webhook worker error');
    });

    logger.info('🚀 Webhook dispatch worker started, waiting for jobs...');
    return workerInstance;
}

export async function stopWebhookWorker(): Promise<void> {
    if (!workerInstance) return;

    logger.info('🛑 Webhook Worker: stopping...');
    try {
        await workerInstance.close();
        logger.info('✅ Webhook Worker closed');
        workerInstance = null;
    } catch (err) {
        logger.error({ error: err }, '❌ Error during webhook worker shutdown');
    }
}

// --- Standalone execution ---
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
    logger.info('🔧 Running Webhook Worker in standalone mode');
    startWebhookWorker();

    const shutdown = async (signal: string) => {
        logger.info({ signal }, '🛑 Webhook Worker standalone: signal received');
        await stopWebhookWorker();
        process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}
