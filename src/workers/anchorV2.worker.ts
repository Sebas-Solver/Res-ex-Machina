// SPDX-License-Identifier: Apache-2.0
/**
 * Worker for rxm-pog-v2 anchoring. Concurrency 1: one relayer key, one transaction at a time,
 * so nonces never collide (fixes A-03 for v2). A reconciler re-enqueues rows left pending or
 * with an expired lease, so nothing depends on a single Redis job surviving (A-07).
 */
import { Queue, Worker } from 'bullmq';
import { redisConnectionConfig } from '../config/redis.js';
import { publicClient, walletClient } from '../config/blockchain.js';
import { db } from '../db/index.js';
import { anchorDeclaration } from '../v2/anchor.js';
import { listToReconcile, type Db } from '../v2/store.js';
import { logger } from '../utils/logger.js';

export const anchorV2Queue = new Queue('anchor-v2', {
    connection: redisConnectionConfig,
    defaultJobOptions: { attempts: 1, removeOnComplete: 100, removeOnFail: 500 },
});

export async function enqueueAnchorV2(id: string): Promise<void> {
    // jobId dedupes while a job for this row is waiting; the reconciler covers lost jobs.
    await anchorV2Queue.add('anchor', { id }, { jobId: `v2-${id}` });
}

export function startAnchorV2Worker(): { close: () => Promise<void> } {
    const worker = new Worker('anchor-v2', async (job) => {
        const out = await anchorDeclaration({ db: db as unknown as Db, publicClient, walletClient }, job.data.id as string);
        logger.info({ id: job.data.id, status: out.status }, '[anchor-v2] processed');
        if (out.status === 'retry') await anchorV2Queue.add('anchor', { id: job.data.id }, { delay: 30_000 });
        return out.status;
    }, { connection: redisConnectionConfig, concurrency: 1 });

    const timer = setInterval(async () => {
        try {
            for (const id of await listToReconcile(db as unknown as Db)) await enqueueAnchorV2(id);
        } catch (e) { logger.error({ err: e }, '[anchor-v2] reconcile failed'); }
    }, 60_000);

    return { close: async () => { clearInterval(timer); await worker.close(); } };
}
