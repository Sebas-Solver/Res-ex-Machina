import { webhookQueue } from '../src/services/webhookDispatcher.js';
import { logger } from '../src/utils/logger.js';

/**
 * Obliteration script for webhook_dispatch queue.
 * Safe script that strictly deletes all jobs from the queue using BullMQ.
 * Does not print any payloads or secrets.
 */

async function obliterateQueue() {
    logger.info('🧨 Initiating obliteration of webhook_dispatch queue...');
    
    try {
        // Obliterate removes everything, including active jobs
        // The `{ force: true }` flag forces obliteration even if there are active jobs.
        await webhookQueue.obliterate({ force: true });
        logger.info('✅ Queue obliterated successfully. All jobs deleted.');
    } catch (err) {
        logger.error({ error: err instanceof Error ? err.message : String(err) }, '❌ Error during obliteration');
    } finally {
        await webhookQueue.close();
        process.exit(0);
    }
}

obliterateQueue();
