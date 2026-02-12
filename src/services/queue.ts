import { Queue } from 'bullmq';
import { env } from '../config/env.js';

/**
 * Conexión Redis para BullMQ.
 * Parseamos la URL de Redis para extraer host, puerto, password y TLS.
 * Upstash usa rediss:// (TLS) + password en la URL.
 */
const redisUrl = new URL(env.REDIS_URL);
const redisConnection = {
    host: redisUrl.hostname,
    port: parseInt(redisUrl.port || '6379', 10),
    password: redisUrl.password || undefined,
    tls: redisUrl.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null as null, // Requerido por BullMQ
};

/**
 * Cola de anchoring — los jobs se procesan en el worker (Issue #6).
 * Cada job contiene el record_id y receipt_hash para grabar on-chain.
 */
export const anchorQueue = new Queue('anchor', {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 5,
        backoff: {
            type: 'exponential',
            delay: 5000, // 5s, 10s, 20s, 40s, 80s
        },
        removeOnComplete: 100,
        removeOnFail: 500,
    },
});

/**
 * Datos del job de anchoring.
 */
export interface AnchorJobData {
    recordId: string;
    receiptHash: string;
}

/**
 * Encola un job de anchoring para un record.
 *
 * @param recordId - UUID del record a anclar
 * @param receiptHash - Hash del receipt (se graba on-chain)
 * @returns ID del job encolado
 */
export async function enqueueAnchorJob(
    recordId: string,
    receiptHash: string,
): Promise<string> {
    const job = await anchorQueue.add(
        'anchor-record',
        { recordId, receiptHash } satisfies AnchorJobData,
        { jobId: recordId },
    );

    return job.id ?? recordId;
}
