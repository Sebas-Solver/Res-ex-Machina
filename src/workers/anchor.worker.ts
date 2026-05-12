import { Worker, type Job } from 'bullmq';
import { redisConnectionConfig } from '../config/redis.js';
import { anchorRecord, markAnchorFailed } from '../services/anchor.js';
import type { AnchorJobData } from '../services/queue.js';
import { logger } from '../utils/logger.js';

/**
 * BullMQ Anchor Worker.
 *
 * Processes jobs from the 'anchor' queue asynchronously.
 * Cada job contiene un recordId y receiptHash para grabar on-chain.
 *
 * Comportamiento (ADR-001):
 * - Retries: 5 (configurado en la cola)
 * - Backoff: exponencial (5s → 10s → 20s → 40s → 80s)
 * - Al agotar retries: state = anchor_failed
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
            throw error; // Re-throw para que BullMQ reintente
        }
    },
    {
        connection: redisConnectionConfig,
        concurrency: 3, // Procesar hasta 3 anchors en paralelo
        maxStalledCount: 2, // Marcar job como fallido si se detecta stalled 2 veces (Threat Model — D-01)
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

    // Si se agotaron los reintentos, marcar como anchor_failed
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
// Al recibir SIGTERM/SIGINT:
// 1. worker.close() deja de coger jobs nuevos
// 2. Espera a que el job actual termine (o timeout de BullMQ)
// 3. Si el proceso muere a medio job, BullMQ lo marca como "stalled"
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
