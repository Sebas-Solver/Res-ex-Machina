import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { records } from '../db/schema.js';

/**
 * Resultado del wait — contiene el record actualizado.
 */
export interface WaitResult {
    state: string;
    anchorTxHash: string | null;
    anchorBlock: number | null;
    anchorChainId: number | null;
    anchoredAt: Date | null;
}

/**
 * Espera a que un record salga del estado `pending_anchor`.
 *
 * Hace polling a la base de datos (no depende de Redis ni BullMQ)
 * hasta que el estado cambie o se agote el timeout.
 *
 * @param recordId - UUID del record a esperar
 * @param maxWaitMs - Maximum wait time (default: 25s, compatible with Render)
 * @param intervalMs - Intervalo entre consultas (default: 2s)
 * @returns El estado actual del record (puede ser pending_anchor si timeout)
 */
export async function waitForAnchor(
    recordId: string,
    maxWaitMs: number = 25000,
    intervalMs: number = 2000,
): Promise<WaitResult> {
    const deadline = Date.now() + maxWaitMs;

    while (Date.now() < deadline) {
        // Consultar estado actual
        const result = await db
            .select({
                state: records.state,
                anchorTxHash: records.anchorTxHash,
                anchorBlock: records.anchorBlock,
                anchorChainId: records.anchorChainId,
                anchoredAt: records.anchoredAt,
            })
            .from(records)
            .where(eq(records.recordId, recordId))
            .limit(1);

        if (result.length === 0) {
            // The record does not exist (should not happen, but we handle it)
            return {
                state: 'pending_anchor',
                anchorTxHash: null,
                anchorBlock: null,
                anchorChainId: null,
                anchoredAt: null,
            };
        }

        const record = result[0];

        // If it left pending_anchor, return immediately
        if (record.state !== 'pending_anchor') {
            return {
                state: record.state,
                anchorTxHash: record.anchorTxHash,
                anchorBlock: record.anchorBlock ? Number(record.anchorBlock) : null,
                anchorChainId: record.anchorChainId,
                anchoredAt: record.anchoredAt,
            };
        }

        // Esperar antes del siguiente intento
        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) break;
        await sleep(Math.min(intervalMs, remainingMs));
    }

    // Timeout — devolver estado actual (pending_anchor)
    return {
        state: 'pending_anchor',
        anchorTxHash: null,
        anchorBlock: null,
        anchorChainId: null,
        anchoredAt: null,
    };
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
