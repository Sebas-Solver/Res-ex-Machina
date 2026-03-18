import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '../src/utils/errors.js';

/**
 * Unit tests for the on-chain fee verification service.
 *
 * Mockeamos viem (createPublicClient) para simular respuestas de la blockchain
 * sin necesitar un nodo real.
 */

// --- Hoisted mocks to avoid initialization issues ---
const mockGetTransaction = vi.fn();
const mockGetTransactionReceipt = vi.fn();
const mockGetBlock = vi.fn();

vi.mock('viem', () => ({
    formatEther: (val: bigint) => (Number(val) / 1e18).toString(),
    parseEther: (val: string) => BigInt(Math.round(parseFloat(val) * 1e18)),
}));

vi.mock('../src/config/blockchain.js', () => ({
    publicClient: {
        getTransaction: (...args: unknown[]) => mockGetTransaction(...args),
        getTransactionReceipt: (...args: unknown[]) => mockGetTransactionReceipt(...args),
        getBlock: (...args: unknown[]) => mockGetBlock(...args),
    },
}));

vi.mock('../src/config/env.js', () => ({
    env: {
        L2_RPC_URL: 'http://localhost:8545',
        FEE_MINIMUM_AMOUNT: 0.01,
        FEE_RECEIVER_ADDRESS: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        FEE_TX_MAX_AGE_HOURS: 24,
    },
}));

// Import AFTER the mocks
const { verifyFee } = await import('../src/services/fee.js');

// --- Fixture: valid tx ---
const VALID_TX = {
    hash: '0x' + 'aa'.repeat(32),
    blockNumber: 100n,
    value: BigInt(1e16), // 0.01 ETH
    to: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
};

const VALID_RECEIPT = {
    status: 'success' as const,
    blockNumber: 100n,
};

const RECENT_BLOCK = {
    timestamp: BigInt(Math.floor(Date.now() / 1000) - 3600), // 1 hour ago
};

beforeEach(() => {
    vi.clearAllMocks();
});

describe('verifyFee', () => {
    it('verifies a valid fee correctly', async () => {
        mockGetTransaction.mockResolvedValue(VALID_TX);
        mockGetTransactionReceipt.mockResolvedValue(VALID_RECEIPT);
        mockGetBlock.mockResolvedValue(RECENT_BLOCK);

        const result = await verifyFee('0x' + 'aa'.repeat(32));

        expect(result.verified).toBe(true);
        expect(result.blockNumber).toBe(100n);
        expect(mockGetTransaction).toHaveBeenCalledOnce();
        expect(mockGetTransactionReceipt).toHaveBeenCalledOnce();
        expect(mockGetBlock).toHaveBeenCalledOnce();
    });

    it('lanza fee_not_verified si la tx no existe', async () => {
        mockGetTransaction.mockRejectedValue(new Error('not found'));
        mockGetTransactionReceipt.mockRejectedValue(new Error('not found'));

        try {
            await verifyFee('0x' + 'bb'.repeat(32));
            expect.unreachable('should have thrown');
        } catch (e) {
            expect(e).toBeInstanceOf(ApiError);
            expect((e as ApiError).code).toBe('fee_not_verified');
            expect((e as ApiError).statusCode).toBe(402);
        }
    });

    it('lanza fee_not_verified si la tx es null', async () => {
        mockGetTransaction.mockResolvedValue(null);
        mockGetTransactionReceipt.mockResolvedValue(null);

        try {
            await verifyFee('0x' + 'cc'.repeat(32));
            expect.unreachable('should have thrown');
        } catch (e) {
            expect((e as ApiError).code).toBe('fee_not_verified');
        }
    });

    it('throws fee_not_verified if tx is not confirmed (receipt failed)', async () => {
        mockGetTransaction.mockResolvedValue(VALID_TX);
        mockGetTransactionReceipt.mockResolvedValue({ ...VALID_RECEIPT, status: 'reverted' });

        try {
            await verifyFee('0x' + 'dd'.repeat(32));
            expect.unreachable('should have thrown');
        } catch (e) {
            expect((e as ApiError).code).toBe('fee_not_verified');
        }
    });

    it('throws fee_insufficient if amount is less than minimum', async () => {
        mockGetTransaction.mockResolvedValue({ ...VALID_TX, value: BigInt(1e14) }); // 0.0001 ETH
        mockGetTransactionReceipt.mockResolvedValue(VALID_RECEIPT);

        try {
            await verifyFee('0x' + 'ee'.repeat(32));
            expect.unreachable('should have thrown');
        } catch (e) {
            expect((e as ApiError).code).toBe('fee_insufficient');
            expect((e as ApiError).statusCode).toBe(402);
        }
    });

    it('lanza fee_wrong_recipient si el destinatario es incorrecto', async () => {
        mockGetTransaction.mockResolvedValue({
            ...VALID_TX,
            to: '0x0000000000000000000000000000000000000001',
        });
        mockGetTransactionReceipt.mockResolvedValue(VALID_RECEIPT);
        mockGetBlock.mockResolvedValue(RECENT_BLOCK);

        try {
            await verifyFee('0x' + 'ff'.repeat(32));
            expect.unreachable('should have thrown');
        } catch (e) {
            expect((e as ApiError).code).toBe('fee_wrong_recipient');
            expect((e as ApiError).statusCode).toBe(402);
        }
    });

    it('throws fee_tx_expired if tx is older than 24h', async () => {
        const oldBlock = {
            timestamp: BigInt(Math.floor(Date.now() / 1000) - 25 * 3600),
        };
        mockGetTransaction.mockResolvedValue(VALID_TX);
        mockGetTransactionReceipt.mockResolvedValue(VALID_RECEIPT);
        mockGetBlock.mockResolvedValue(oldBlock);

        try {
            await verifyFee('0x' + '11'.repeat(32));
            expect.unreachable('should have thrown');
        } catch (e) {
            expect((e as ApiError).code).toBe('fee_tx_expired');
            expect((e as ApiError).statusCode).toBe(402);
        }
    });

    it('accepts a fee exactly at the minimum limit (0.01 ETH)', async () => {
        mockGetTransaction.mockResolvedValue({ ...VALID_TX, value: BigInt(1e16) });
        mockGetTransactionReceipt.mockResolvedValue(VALID_RECEIPT);
        mockGetBlock.mockResolvedValue(RECENT_BLOCK);

        const result = await verifyFee('0x' + '22'.repeat(32));
        expect(result.verified).toBe(true);
    });

    it('accepts a fee greater than the minimum (1 ETH)', async () => {
        mockGetTransaction.mockResolvedValue({ ...VALID_TX, value: BigInt(1e18) });
        mockGetTransactionReceipt.mockResolvedValue(VALID_RECEIPT);
        mockGetBlock.mockResolvedValue(RECENT_BLOCK);

        const result = await verifyFee('0x' + '33'.repeat(32));
        expect(result.verified).toBe(true);
    });
});
