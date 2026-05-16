// SPDX-License-Identifier: Apache-2.0

import { logger } from '../utils/logger.js';

/**
 * Bootstrap script to start all workers for standalone execution.
 * 
 * Imports and starts both the anchor worker and the webhook dispatch worker.
 * Handles graceful shutdown for both.
 */

async function startAllWorkers() {
    logger.info('🚀 Starting all background workers...');

    try {
        await import('./anchor.worker.js');
        const { startWebhookWorker, stopWebhookWorker } = await import('./webhook.worker.js');
        
        startWebhookWorker();
        logger.info('✅ All workers started successfully');

        const shutdown = async (signal: string) => {
            logger.info({ signal }, '🛑 Shutdown signal received for workers');
            await stopWebhookWorker();
            process.exit(0);
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
    } catch (error) {
        logger.error({ error }, '❌ Error starting workers');
        process.exit(1);
    }
}

startAllWorkers();
