import { Worker, type Job } from 'bullmq';
import { env } from '../config/env.js';
import { anchorRecord, markAnchorFailed } from '../services/anchor.js';
import type { AnchorJobData } from '../services/queue.js';

/**
 * BullMQ Anchor Worker.
 *
 * Procesa jobs de la cola 'anchor' de forma asíncrona.
 * Cada job contiene un recordId y receiptHash para grabar on-chain.
 *
 * Comportamiento (ADR-001):
 * - Retries: 5 (configurado en la cola)
 * - Backoff: exponencial (5s → 10s → 20s → 40s → 80s)
 * - Al agotar retries: state = anchor_failed
 * - Idempotente: si el record ya está anchored, no hace nada
 */

const redisUrl = new URL(env.REDIS_URL);

const worker = new Worker<AnchorJobData>(
    'anchor',
    async (job: Job<AnchorJobData>) => {
        const { recordId, receiptHash } = job.data;

        console.log(`⚓ Anchoring record ${recordId} (attempt ${job.attemptsMade + 1})`);

        try {
            const result = await anchorRecord(recordId, '', receiptHash);
            console.log(`✅ Anchored ${recordId} → tx: ${result.txHash} block: ${result.block}`);
            return result;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`❌ Anchor failed for ${recordId}: ${message}`);
            throw error; // Re-throw para que BullMQ reintente
        }
    },
    {
        connection: {
            host: redisUrl.hostname,
            port: parseInt(redisUrl.port || '6379', 10),
            password: redisUrl.password || undefined,
            tls: redisUrl.protocol === 'rediss:' ? {} : undefined,
            maxRetriesPerRequest: null,
        },
        concurrency: 3, // Procesar hasta 3 anchors en paralelo
    },
);

// --- Event handlers ---

worker.on('completed', (job) => {
    console.log(`🏁 Job ${job.id} completed`);
});

worker.on('failed', async (job, error) => {
    if (!job) return;

    const { recordId } = job.data;
    const maxAttempts = job.opts.attempts ?? 5;

    console.error(`💀 Job ${job.id} failed (attempt ${job.attemptsMade}/${maxAttempts}): ${error.message}`);

    // Si se agotaron los reintentos, marcar como anchor_failed
    if (job.attemptsMade >= maxAttempts) {
        console.error(`🚫 All retries exhausted for ${recordId}, marking as anchor_failed`);
        await markAnchorFailed(recordId, error.message, job.attemptsMade);
    }
});

worker.on('error', (error) => {
    console.error('Worker error:', error);
});

console.log('⚓ Anchor worker started, waiting for jobs...');

// --- Graceful shutdown (Q-3) ---
// Al recibir SIGTERM/SIGINT:
// 1. worker.close() deja de coger jobs nuevos
// 2. Espera a que el job actual termine (o timeout de BullMQ)
// 3. Si el proceso muere a medio job, BullMQ lo marca como "stalled"
//    y lo re-encola automáticamente. anchorRecord es idempotente:
//    si el record ya está anchored, no duplica el anchor.
async function shutdown(signal: string) {
    console.log(`🛑 Worker: ${signal} recibido — cerrando...`);

    try {
        // Cierra el worker: no coge más jobs, espera al actual
        await worker.close();
        console.log('✅ Worker cerrado (job actual completado o devuelto a cola)');

        process.exit(0);
    } catch (err) {
        console.error('❌ Error durante shutdown del worker:', err);
        process.exit(1);
    }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default worker;
