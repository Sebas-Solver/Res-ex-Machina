import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '../src/utils/errors.js';

/**
 * Tests unitarios para el servicio de verificación de fee on-chain.
 *
 * Mockeamos viem (createPublicClient) para simular respuestas de la blockchain
 * sin necesitar un nodo real.
 */

// --- Mocks hoisted para evitar problemas de inicialización ---
const mockGetTransaction = vi.fn();
const mockGetBlock = vi.fn();

vi.mock('viem', () => ({
    createPublicClient: () => ({
        getTransaction: (...args: unknown[]) => mockGetTransaction(...args),
        getBlock: (...args: unknown[]) => mockGetBlock(...args),
    }),
    http: () => ({}),
    formatEther: (val: bigint) => (Number(val) / 1e18).toString(),
}));

vi.mock('../src/config/env.js', () => ({
    env: {
        L2_RPC_URL: 'http://localhost:8545',
        FEE_MINIMUM_AMOUNT: 0.01,
        FEE_RECEIVER_ADDRESS: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    },
}));

// Import DESPUÉS de los mocks
const { verifyFee } = await import('../src/services/fee.js');

// --- Fixture: tx válida ---
const VALID_TX = {
    hash: '0x' + 'aa'.repeat(32),
    blockNumber: 100n,
    value: BigInt(1e16), // 0.01 ETH
    to: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
};

const RECENT_BLOCK = {
    timestamp: BigInt(Math.floor(Date.now() / 1000) - 3600), // 1 hora atrás
};

beforeEach(() => {
    vi.clearAllMocks();
});

describe('verifyFee', () => {
    it('verifica un fee válido correctamente', async () => {
        mockGetTransaction.mockResolvedValue(VALID_TX);
        mockGetBlock.mockResolvedValue(RECENT_BLOCK);

        const result = await verifyFee('0x' + 'aa'.repeat(32));

        expect(result.verified).toBe(true);
        expect(result.blockNumber).toBe(100n);
        expect(mockGetTransaction).toHaveBeenCalledOnce();
        expect(mockGetBlock).toHaveBeenCalledOnce();
    });

    it('lanza fee_not_verified si la tx no existe', async () => {
        mockGetTransaction.mockRejectedValue(new Error('not found'));

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

        try {
            await verifyFee('0x' + 'cc'.repeat(32));
            expect.unreachable('should have thrown');
        } catch (e) {
            expect((e as ApiError).code).toBe('fee_not_verified');
        }
    });

    it('lanza fee_not_verified si la tx no está confirmada', async () => {
        mockGetTransaction.mockResolvedValue({ ...VALID_TX, blockNumber: null });

        try {
            await verifyFee('0x' + 'dd'.repeat(32));
            expect.unreachable('should have thrown');
        } catch (e) {
            expect((e as ApiError).code).toBe('fee_not_verified');
            expect((e as ApiError).details?.reason).toBe('Transaction is not yet confirmed');
        }
    });

    it('lanza fee_insufficient si el monto es menor al mínimo', async () => {
        mockGetTransaction.mockResolvedValue({ ...VALID_TX, value: BigInt(1e14) }); // 0.0001 ETH

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
        mockGetBlock.mockResolvedValue(RECENT_BLOCK);

        try {
            await verifyFee('0x' + 'ff'.repeat(32));
            expect.unreachable('should have thrown');
        } catch (e) {
            expect((e as ApiError).code).toBe('fee_wrong_recipient');
            expect((e as ApiError).statusCode).toBe(402);
        }
    });

    it('lanza fee_tx_expired si la tx tiene más de 24h', async () => {
        const oldBlock = {
            timestamp: BigInt(Math.floor(Date.now() / 1000) - 25 * 3600),
        };
        mockGetTransaction.mockResolvedValue(VALID_TX);
        mockGetBlock.mockResolvedValue(oldBlock);

        try {
            await verifyFee('0x' + '11'.repeat(32));
            expect.unreachable('should have thrown');
        } catch (e) {
            expect((e as ApiError).code).toBe('fee_tx_expired');
            expect((e as ApiError).statusCode).toBe(402);
        }
    });

    it('acepta un fee justo en el límite mínimo (0.01 ETH)', async () => {
        mockGetTransaction.mockResolvedValue({ ...VALID_TX, value: BigInt(1e16) });
        mockGetBlock.mockResolvedValue(RECENT_BLOCK);

        const result = await verifyFee('0x' + '22'.repeat(32));
        expect(result.verified).toBe(true);
    });

    it('acepta un fee mayor al mínimo (1 ETH)', async () => {
        mockGetTransaction.mockResolvedValue({ ...VALID_TX, value: BigInt(1e18) });
        mockGetBlock.mockResolvedValue(RECENT_BLOCK);

        const result = await verifyFee('0x' + '33'.repeat(32));
        expect(result.verified).toBe(true);
    });
});
