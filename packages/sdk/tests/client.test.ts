import { describe, it, expect } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { RxMClient } from '../src/client.js';
import { RxMValidationError } from '../src/errors.js';

const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const account = privateKeyToAccount(TEST_PRIVATE_KEY);

function createClient() {
    return new RxMClient({
        account,
        rpcUrl: 'https://sepolia.base.org',
        apiUrl: 'http://localhost:3000',
        feeReceiverAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    });
}

describe('RxMClient — Validation', () => {
    const rxm = createClient();

    it('should reject empty modelId', async () => {
        await expect(
            rxm.record('test', { modelId: '' }),
        ).rejects.toThrow(RxMValidationError);
    });

    it('should reject modelId > 128 chars', async () => {
        await expect(
            rxm.record('test', { modelId: 'a'.repeat(129) }),
        ).rejects.toThrow(RxMValidationError);
    });

    it('should reject more than 10 tags', async () => {
        await expect(
            rxm.record('test', {
                modelId: 'test:model:v1',
                tags: Array.from({ length: 11 }, (_, i) => `tag${i}`),
            }),
        ).rejects.toThrow(RxMValidationError);
    });

    it('should reject tags > 64 characters', async () => {
        await expect(
            rxm.record('test', {
                modelId: 'test:model:v1',
                tags: ['a'.repeat(65)],
            }),
        ).rejects.toThrow(RxMValidationError);
    });

    it('should reject invalid humanInterventionLevel', async () => {
        await expect(
            rxm.record('test', { modelId: 'test:model:v1', humanInterventionLevel: 6 }),
        ).rejects.toThrow(RxMValidationError);
    });

    it('should reject pipelineSteps < 1', async () => {
        await expect(
            rxm.record('test', { modelId: 'test:model:v1', pipelineSteps: 0 }),
        ).rejects.toThrow(RxMValidationError);
    });

    it('should reject empty batch', async () => {
        await expect(
            rxm.recordBatch([]),
        ).rejects.toThrow(RxMValidationError);
    });

    it('should reject batch > 100 items', async () => {
        const items = Array.from({ length: 101 }, () => ({
            content: 'test',
            options: { modelId: 'test:m:v1', feeTxHash: '0x' + '0'.repeat(64) as `0x${string}` },
        }));
        await expect(
            rxm.recordBatch(items),
        ).rejects.toThrow(RxMValidationError);
    });
});

describe('RxMClient — Constructor', () => {
    it('should create with defaults', () => {
        const rxm = createClient();
        expect(rxm).toBeInstanceOf(RxMClient);
        expect(rxm.webhooks).toBeDefined();
    });

    it('should accept custom options', () => {
        const rxm = new RxMClient({
            account,
            rpcUrl: 'https://sepolia.base.org',
            apiUrl: 'http://localhost:3000',
            feeReceiverAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
            feeAmount: 0.05,
            chainId: 137,
            httpTimeoutMs: 5000,
            httpRetries: 1,
        });
        expect(rxm).toBeInstanceOf(RxMClient);
    });
});
