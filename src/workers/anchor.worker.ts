import { Worker, type Job } from 'bullmq';
import { redisConnectionConfig } from '../config/redis.js';
import { anchorRecord, markAnchorFailed } from '../services/anchor.js';
import type { AnchorJobData } from '../services/queue.js';
import { logger } from '../utils/logger.js';

/**
 * BullMQ Anchor Worker.
 *
 * Processes jobs from the 'anchor' queue asynchronously.
 * Each job contains a recordId and receiptHash to write on-chain.
 *
 * Behavior (ADR-001):
 * - Retries: 5 (configured in the queue)
 * - Backoff: exponential (5s → 10s → 20s → 40s → 80s)
 * - After exhausting retries: state = anchor_failed
 * - Idempotent: if the record is already anchored, it does nothing
 *
 * Redis connection centralized in config/redis.ts (Issue #16).
 */

const worker = new Worker<AnchorJobData>(
    'anchor',
    async (job: Job<AnchorJobData>) => {
        const { recordId, receiptHash, agentWallet } = job.data;

        logger.info({ recordId, attempt: job.attemptsMade + 1 }, '⚓ Anchoring record');

        try {
            const result = await anchorRecord(recordId, receiptHash, agentWallet);
            logger.info({ recordId, txHash: result.txHash, block: result.block }, '✅ Record anchored');
            return result;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error({ recordId, error: message }, '❌ Anchor failed');
            throw error; // Re-throw so BullMQ retries
        }
    },
    {
        connection: redisConnectionConfig,
        concurrency: 3, // Process up to 3 anchors in parallel
        maxStalledCount: 2, // Mark job as failed if stalled 2 times (Threat Model — D-01)
    },
);

// --- Event handlers ---

worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, '🏁 Job completed');
});

worker.on('failed', async (job, error) => {
    if (!job) return;

    const { recordId } = job.data;
    const maxAttempts = job.opts.attempts ?? 5;

    logger.error({ jobId: job.id, recordId, attempt: job.attemptsMade, maxAttempts, error: error.message }, '💀 Job failed');

    // If all retries exhausted, mark as anchor_failed
    if (job.attemptsMade >= maxAttempts) {
        logger.error({ recordId }, '🚫 All retries exhausted, marking as anchor_failed');
        await markAnchorFailed(recordId, error.message, job.attemptsMade);
    }
});

worker.on('error', (error) => {
    logger.error({ error }, 'Worker error');
});

logger.info('⚓ Anchor worker started, waiting for jobs...');

// --- Graceful shutdown (Q-3) ---
// On SIGTERM/SIGINT:
// 1. worker.close() stops accepting new jobs
// 2. Waits for the current job to finish (or BullMQ timeout)
// 3. If the process dies mid-job, BullMQ marks it as "stalled"
//    and re-queues it automatically. anchorRecord is idempotent:
//    if the record is already anchored, it won't duplicate the anchor.
async function shutdown(signal: string) {
    logger.info({ signal }, '🛑 Worker: shutdown signal received');

    try {
        // Closes the worker: stops taking new jobs, waits for current one
        await worker.close();
        logger.info('✅ Worker closed (current job completed or returned to queue)');

        process.exit(0);
    } catch (err) {
        logger.error({ error: err }, '❌ Error during worker shutdown');
        process.exit(1);
    }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default worker;
