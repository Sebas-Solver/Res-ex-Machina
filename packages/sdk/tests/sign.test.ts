import { describe, it, expect } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { signPoGBundle, EIP712_DOMAIN, EIP712_TYPES, type PoGSignatureMessage } from '../src/sign.js';

// Hardhat test account #0
const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

describe('signPoGBundle', () => {
    const account = privateKeyToAccount(TEST_PRIVATE_KEY);

    const testMessage: PoGSignatureMessage = {
        schema: 'pog.v1',
        content_hash: 'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        agent_wallet: account.address,
        model_id: 'openai:gpt-4o:2026-01',
        runtime_id: 'node-22.x',
        process_type: 'direct',
        human_intervention_level: 0,
        pipeline_steps: 1,
        timestamp: '2026-02-16T18:00:00.000Z',
        nonce: 'test-nonce-1234567890',
    };

    it('should produce a valid EIP-712 signature', async () => {
        const signature = await signPoGBundle(account, testMessage);
        expect(signature).toMatch(/^0x[a-fA-F0-9]{130}$/);
    });

    it('should produce deterministic signatures for same input', async () => {
        const sig1 = await signPoGBundle(account, testMessage);
        const sig2 = await signPoGBundle(account, testMessage);
        expect(sig1).toBe(sig2);
    });

    it('should produce different signatures for different content', async () => {
        const sig1 = await signPoGBundle(account, testMessage);
        const sig2 = await signPoGBundle(account, {
            ...testMessage,
            content_hash: 'sha256:0000000000000000000000000000000000000000000000000000000000000001',
        });
        expect(sig1).not.toBe(sig2);
    });

    it('should throw if account lacks signTypedData', async () => {
        const badAccount = { address: account.address } as any;
        await expect(signPoGBundle(badAccount, testMessage)).rejects.toThrow('signTypedData');
    });
});

describe('EIP712 constants', () => {
    it('should have correct domain name', () => {
        expect(EIP712_DOMAIN.name).toBe('ResExMachina');
    });

    it('should have chainId 0 (off-chain)', () => {
        expect(EIP712_DOMAIN.chainId).toBe(0);
    });

    it('should have 10 fields in PoGBundle type', () => {
        expect(EIP712_TYPES.PoGBundle).toHaveLength(10);
    });
});
