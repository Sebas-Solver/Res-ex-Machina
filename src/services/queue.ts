// SPDX-License-Identifier: Apache-2.0

import { Queue } from 'bullmq';
import { redisConnectionConfig } from '../config/redis.js';

/**
 * Anchoring queue — jobs are processed by the worker (Issue #6).
 * Each job contains the record_id and receipt_hash to write on-chain.
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
 * Anchoring job data.
 */
export interface AnchorJobData {
    recordId: string;
    receiptHash: string;
    agentWallet?: string;
}

/**
 * Enqueues an anchoring job for a record.
 *
 * @param recordId - UUID of the record to anchor
 * @param receiptHash - Hash of the receipt (written on-chain)
 * @param agentWallet - Agent wallet (passed to anchorRecord to avoid extra DB query)
 * @returns Enqueued job ID
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
