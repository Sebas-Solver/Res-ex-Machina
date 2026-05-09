import { Queue } from 'bullmq';
import { redisConnectionConfig } from '../config/redis.js';

/**
 * Cola de anchoring — los jobs se procesan en el worker (Issue #6).
 * Cada job contiene el record_id y receipt_hash para grabar on-chain.
 *
 * Redis connection centralized in config/redis.ts (Issue #16).
 */

export const anchorQueue = new Queue('anchor', {
    connection: redisConnectionConfig,
    defaultJobOptions: {
        attempts: 5,
        backoff: {
            type: 'exponential',
            delay: 5000, // 5s, 10s, 20s, 40s, 80s
        },
        removeOnComplete: 50, // Threat Model — D-01: reduce retention in Redis
        removeOnFail: 200,
    },
});

/**
 * Datos del job de anchoring.
 */
export interface AnchorJobData {
    recordId: string;
    receiptHash: string;
    agentWallet?: string;
}

/**
 * Encola un job de anchoring para un record.
 *
 * @param recordId - UUID del record a anclar
 * @param receiptHash - Hash del receipt (se graba on-chain)
 * @param agentWallet - Wallet del agente (passed to anchorRecord to avoid extra DB query)
 * @returns ID del job encolado
 */
export async function enqueueAnchorJob(
    recordId: string,
    receiptHash: string,
    agentWallet?: string,
): Promise<string> {
    const job = await anchorQueue.add(
        'anchor-record',
        { recordId, receiptHash, agentWallet } satisfies AnchorJobData,
        { jobId: recordId },
    );

    return job.id ?? recordId;
}
