// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { anchorRecord } from '../src/services/anchor.js';

// Mock viem and db
vi.mock('../src/config/blockchain.js', () => ({
    walletClient: {
        sendTransaction: vi.fn().mockResolvedValue('0xmocktxhash123'),
    },
    publicClient: {
        waitForTransactionReceipt: vi.fn().mockResolvedValue({
            blockNumber: 123456n,
        }),
    },
}));

vi.mock('../src/db/index.js', () => {
    let mockRecord = {
        recordId: 'rec-test-123',
        state: 'pending_anchor',
        receiptHash: 'sha256:abcd1234efgh5678',
        agentWallet: '0x1111111111111111111111111111111111111111',
        anchorTxHash: null,
        anchorBlock: null,
        anchorChainId: null,
    };

    return {
        db: {
            select: vi.fn().mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockReturnValue({
                        limit: vi.fn().mockImplementation(() => Promise.resolve([mockRecord])),
                    }),
                }),
            }),
            update: vi.fn().mockReturnValue({
                set: vi.fn().mockImplementation((setValues) => ({
                    where: vi.fn().mockReturnValue({
                        returning: vi.fn().mockImplementation(() => {
                            if (mockRecord.state === 'pending_anchor' && setValues.state === 'anchoring') {
                                mockRecord.state = 'anchoring';
                                return Promise.resolve([{ recordId: mockRecord.recordId }]);
                            }
                            return Promise.resolve([]);
                        }),
                    }),
                })),
            }),
        },
    };
});

describe('anchorRecord (P1-07 Concurrency & Idempotency)', () => {
    it('throws when record is not found', async () => {
        const { db } = await import('../src/db/index.js');
        vi.mocked(db.select).mockReturnValueOnce({
            from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue([]),
                }),
            }),
        } as any);

        await expect(anchorRecord('non-existent-uuid', 'sha256:hash')).rejects.toThrow('not found');
    });

    it('returns existing tx hash if already anchored', async () => {
        const { db } = await import('../src/db/index.js');
        vi.mocked(db.select).mockReturnValueOnce({
            from: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                    limit: vi.fn().mockResolvedValue([{
                        state: 'anchored',
                        receiptHash: 'sha256:already',
                        agentWallet: '0x111',
                        anchorTxHash: '0xexistingtx',
                        anchorBlock: 999n,
                        anchorChainId: 84532,
                    }]),
                }),
            }),
        } as any);

        const result = await anchorRecord('rec-anchored', 'sha256:already');
        expect(result.txHash).toBe('0xexistingtx');
        expect(result.block).toBe(999);
    });
});
