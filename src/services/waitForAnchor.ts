// SPDX-License-Identifier: Apache-2.0

import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { records } from '../db/schema.js';

/**
 * Wait result — contains the updated record.
 */
export interface WaitResult {
    state: string;
    anchorTxHash: string | null;
    anchorBlock: number | null;
    anchorChainId: number | null;
    anchoredAt: Date | null;
}

/**
 * Waits for a record to leave the `pending_anchor` state.
 *
 * Polls the database (does not depend on Redis or BullMQ)
 * until the state changes or the timeout expires.
 *
 * @param recordId - UUID of the record to wait for
 * @param maxWaitMs - Maximum wait time (default: 25s, compatible with Render)
 * @param intervalMs - Interval between queries (default: 2s)
 * @returns The current state of the record (may be pending_anchor on timeout)
 */
export async function waitForAnchor(
    recordId: string,
    maxWaitMs: number = 25000,
    intervalMs: number = 2000,
): Promise<WaitResult> {
    const deadline = Date.now() + maxWaitMs;

    while (Date.now() < deadline) {
        // Query current state
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

        // Wait before next attempt
        const remainingMs = deadline - Date.now();
        if (remainingMs <= 0) break;
        await sleep(Math.min(intervalMs, remainingMs));
    }

    // Timeout — return current state (pending_anchor)
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
