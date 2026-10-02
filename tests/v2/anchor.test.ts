// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Hex } from 'viem';
import { erc8263 } from '@res-ex-machina/pog';
import { acceptDeclaration } from '../../src/v2/accept.js';
import { anchorDeclaration, type AnchorDeps } from '../../src/v2/anchor.js';
import { getById, claimForAnchoring, type Db } from '../../src/v2/store.js';
import { createTestDb, cfg, signed, CONTRACT } from './helpers.js';

vi.mock('../../src/config/monitoring.js', () => ({ Sentry: { captureException: vi.fn() }, initMonitoring: vi.fn() }));

let t: { db: Db; close: () => Promise<void> };
beforeEach(async () => { t = await createTestDb(); });
afterEach(async () => { await t.close(); });

const TX = ('0x' + '1a'.repeat(32)) as Hex;

/** Fake chain: writeContract returns TX; the receipt carries the AnchorProof log for `digest`. */
function fakeChain(digest: string, opts: { failSend?: number; failReceiptOnce?: boolean } = {}) {
    let sends = 0; let receiptFailed = false;
    const writeContract = vi.fn(async () => {
        if (opts.failSend && sends++ < opts.failSend) throw new Error('rpc down');
        return TX;
    });
    const waitForTransactionReceipt = vi.fn(async () => {
        if (opts.failReceiptOnce && !receiptFailed) { receiptFailed = true; throw new Error('timeout waiting for receipt'); }
        return {
            status: 'success', blockNumber: 77n,
            logs: [{ address: CONTRACT, logIndex: 3, topics: [erc8263.ERC8263_TOPIC0, '0x' + '00'.repeat(32), digest, '0x' + '00'.repeat(32)] }],
        };
    });
    const deps = {
        db: t.db,
        walletClient: { writeContract },
        publicClient: { waitForTransactionReceipt, getBlock: vi.fn(async () => ({ timestamp: 1790900000n })) },
        maxAttempts: 2,
    } as unknown as AnchorDeps;
    return { deps, writeContract, waitForTransactionReceipt };
}

async function accepted() {
    const s = await signed();
    const { row } = await acceptDeclaration(cfg(), { db: t.db, enqueue: async () => {} }, s.body);
    return row;
}

describe('anchorDeclaration', () => {
    it('anchors once with the digest, the CAIP-10 agentId and the signature in aux', async () => {
        const row = await accepted();
        const c = fakeChain(row.digest);
        const out = await anchorDeclaration(c.deps, row.id);
        expect(out.status).toBe('anchored');
        const args = (c.writeContract.mock.calls[0] as unknown as [{ args: unknown[] }])[0].args;
        expect(args).toEqual([2, row.agentId, row.digest, erc8263.encodeSingleAux(row.signature as Hex)]);
        const after = await getById(t.db, row.id);
        expect(after?.state).toBe('anchored');
        expect(after?.anchorLogIndex).toBe(3);
        expect(after?.anchorBlock).toBe(77n);
        expect((await anchorDeclaration(c.deps, row.id)).status).toBe('skipped');
        expect(c.writeContract).toHaveBeenCalledTimes(1);
    });

    it('a failed send goes back to pending, then to failed after maxAttempts', async () => {
        const row = await accepted();
        const c = fakeChain(row.digest, { failSend: 5 });
        expect((await anchorDeclaration(c.deps, row.id)).status).toBe('retry');
        expect((await getById(t.db, row.id))?.state).toBe('pending');
        expect((await anchorDeclaration(c.deps, row.id)).status).toBe('failed');
        expect((await getById(t.db, row.id))?.state).toBe('failed');
    });

    it('if the worker dies after sending, the retry confirms that tx instead of sending another', async () => {
        const row = await accepted();
        const c = fakeChain(row.digest, { failReceiptOnce: true });
        expect((await anchorDeclaration(c.deps, row.id)).status).toBe('retry');
        expect((await getById(t.db, row.id))?.anchorTxHash).toBe(TX);
        expect((await anchorDeclaration(c.deps, row.id)).status).toBe('anchored');
        expect(c.writeContract).toHaveBeenCalledTimes(1);
    });

    it('a row under a live lease is not taken by a second worker', async () => {
        const row = await accepted();
        await claimForAnchoring(t.db, row.id, 300);
        const c = fakeChain(row.digest);
        expect((await anchorDeclaration(c.deps, row.id)).status).toBe('skipped');
        expect(c.writeContract).not.toHaveBeenCalled();
    });

    it('a receipt without the AnchorProof log for this digest is not marked anchored', async () => {
        const row = await accepted();
        const c = fakeChain('0x' + 'ff'.repeat(32));
        expect((await anchorDeclaration(c.deps, row.id)).status).toBe('retry');
        expect((await getById(t.db, row.id))?.state).toBe('pending');
    });
});
