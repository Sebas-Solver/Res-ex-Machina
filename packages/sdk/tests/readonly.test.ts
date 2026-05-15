import { describe, it, expect } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { RxMClient } from '../src/client.js';
import { RxMReadOnlyError, RxMValidationError } from '../src/errors.js';

// ─── Test helpers ──────────────────────────────────────────────

const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const account = privateKeyToAccount(TEST_PRIVATE_KEY);
const API_URL = 'http://localhost:3000';

function createWritableClient() {
    const client = new RxMClient({
        account,
        rpcUrl: 'https://sepolia.base.org',
        apiUrl: API_URL,
        feeReceiverAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    });
    // Mock HTTP to fail fast
    // @ts-ignore: private access for testing
    client.http.request = async () => { throw new Error('Mock network error'); };
    return client;
}

function createReadOnlyClient() {
    const client = new RxMClient({
        apiUrl: API_URL,
        readOnly: true,
    });
    // Mock HTTP to fail fast
    // @ts-ignore: private access for testing
    client.http.request = async () => { throw new Error('Mock network error'); };
    return client;
}

// ─── Read-only constructor ─────────────────────────────────────

describe('RxMClient — Read-only constructor', () => {
    it('should create a read-only client with only apiUrl', () => {
        const rxm = createReadOnlyClient();
        expect(rxm).toBeInstanceOf(RxMClient);
        expect(rxm.readOnly).toBe(true);
    });

    it('should NOT require account, rpcUrl, or feeReceiverAddress', () => {
        // This compiles and runs without error — TypeScript enforces the union
        const rxm = new RxMClient({ apiUrl: API_URL, readOnly: true });
        expect(rxm.readOnly).toBe(true);
    });

    it('should accept custom httpTimeoutMs and httpRetries', () => {
        const rxm = new RxMClient({
            apiUrl: API_URL,
            readOnly: true,
            httpTimeoutMs: 5000,
            httpRetries: 1,
        });
        expect(rxm.readOnly).toBe(true);
    });

    it('should expose webhooks subclient', () => {
        const rxm = createReadOnlyClient();
        expect(rxm.webhooks).toBeDefined();
    });
});

// ─── Write operations blocked in read-only ─────────────────────

describe('RxMClient — Write operations blocked in read-only', () => {
    const rxm = createReadOnlyClient();

    it('record() throws RxMReadOnlyError with code read_only_client', async () => {
        await expect(
            rxm.record('test', { modelId: 'test:model:v1' }),
        ).rejects.toThrow(RxMReadOnlyError);

        try {
            await rxm.record('test', { modelId: 'test:model:v1' });
        } catch (e: any) {
            expect(e.code).toBe('read_only_client');
            expect(e.message).toContain('record');
            expect(e.message).toContain('read-only mode');
        }
    });

    it('recordHash() throws RxMReadOnlyError', async () => {
        await expect(
            rxm.recordHash('sha256:abc', { modelId: 'test:model:v1' }),
        ).rejects.toThrow(RxMReadOnlyError);
    });

    it('recordBatch() throws RxMReadOnlyError', async () => {
        await expect(
            rxm.recordBatch([{
                content: 'test',
                options: { modelId: 'test:m:v1', feeTxHash: '0x' + '0'.repeat(64) as `0x${string}` },
            }]),
        ).rejects.toThrow(RxMReadOnlyError);
    });
});

// ─── Webhooks blocked in read-only ─────────────────────────────

describe('RxMClient — Webhooks blocked in read-only', () => {
    const rxm = createReadOnlyClient();

    it('webhooks.register() throws RxMReadOnlyError', async () => {
        await expect(
            rxm.webhooks.register('https://example.com/hook'),
        ).rejects.toThrow(RxMReadOnlyError);

        try {
            await rxm.webhooks.register('https://example.com/hook');
        } catch (e: any) {
            expect(e.code).toBe('read_only_client');
            expect(e.message).toContain('webhooks.register');
        }
    });

    it('webhooks.list() throws RxMReadOnlyError', async () => {
        await expect(
            rxm.webhooks.list(),
        ).rejects.toThrow(RxMReadOnlyError);
    });

    it('webhooks.delete() throws RxMReadOnlyError', async () => {
        await expect(
            rxm.webhooks.delete('wh_123'),
        ).rejects.toThrow(RxMReadOnlyError);
    });
});

// ─── Read operations allowed in read-only ──────────────────────

describe('RxMClient — Read operations allowed in read-only', () => {
    const rxm = createReadOnlyClient();

    it('verify() does NOT throw RxMReadOnlyError', async () => {
        // Will fail with network error (no server), but NOT with RxMReadOnlyError
        try {
            await rxm.verify('sha256:abc123');
        } catch (e: any) {
            expect(e).not.toBeInstanceOf(RxMReadOnlyError);
            if (e.message !== 'Mock network error') {
                throw e; // fail if it's some other unexpected error
            }
        }
    });

    it('getRecord() does NOT throw RxMReadOnlyError', async () => {
        try {
            await rxm.getRecord('rec_123');
        } catch (e: any) {
            expect(e).not.toBeInstanceOf(RxMReadOnlyError);
        }
    });

    it('export() does NOT throw RxMReadOnlyError', async () => {
        try {
            await rxm.export('rec_123');
        } catch (e: any) {
            expect(e).not.toBeInstanceOf(RxMReadOnlyError);
        }
    });

    it('waitForRecord() does NOT throw RxMReadOnlyError', async () => {
        // Will timeout/fail with network error, but NOT with RxMReadOnlyError
        try {
            // Very fast polling config to fail fast without hitting vitest 5000ms timeout
            await rxm.waitForRecord('rec_123', 50, 10);
        } catch (e: any) {
            expect(e).not.toBeInstanceOf(RxMReadOnlyError);
        }
    });
});

// ─── listRecords in read-only ──────────────────────────────────

describe('RxMClient — listRecords read-only behavior', () => {
    // Create client
    const rxm = createReadOnlyClient();

    it('listRecords({ agentWallet }) does NOT throw guard', async () => {
        // Will fail with network error, but NOT with RxMReadOnlyError or RxMValidationError
        try {
            await rxm.listRecords({ agentWallet: '0x1234567890abcdef1234567890abcdef12345678' });
        } catch (e: any) {
            expect(e).not.toBeInstanceOf(RxMReadOnlyError);
            expect(e).not.toBeInstanceOf(RxMValidationError);
        }
    });

    it('listRecords({}) throws missing_agent_wallet, NOT read_only_client', async () => {
        await expect(
            rxm.listRecords(),
        ).rejects.toThrow(RxMValidationError);

        try {
            await rxm.listRecords();
        } catch (e: any) {
            expect(e).toBeInstanceOf(RxMValidationError);
            expect(e).not.toBeInstanceOf(RxMReadOnlyError);
            expect(e.message).toContain('agentWallet');
            expect(e.details?.code).toBe('missing_agent_wallet');
        }
    });

    it('listRecords({}) without agentWallet gives clear error message', async () => {
        try {
            await rxm.listRecords({ limit: 10 });
        } catch (e: any) {
            expect(e.message).toContain('read-only mode');
            expect(e.message).toContain('agentWallet');
        }
    });
});

// ─── listRecords in writable mode ──────────────────────────────

describe('RxMClient — listRecords writable behavior', () => {
    const rxm = createWritableClient();

    it('listRecords({}) defaults to account.address', async () => {
        // Will fail with network error, but will NOT throw validation error
        try {
            await rxm.listRecords({ limit: 10 });
        } catch (e: any) {
            expect(e).not.toBeInstanceOf(RxMValidationError);
            expect(e).not.toBeInstanceOf(RxMReadOnlyError);
        }
    });

    it('listRecords({ agentWallet }) can query another wallet', async () => {
        // Writable client querying another wallet — endpoint is public
        try {
            await rxm.listRecords({ agentWallet: '0x0000000000000000000000000000000000000001' });
        } catch (e: any) {
            expect(e).not.toBeInstanceOf(RxMValidationError);
            expect(e).not.toBeInstanceOf(RxMReadOnlyError);
        }
    });
});

// ─── Writable client regression ────────────────────────────────

describe('RxMClient — Writable client regression', () => {
    it('writable client readOnly is false', () => {
        const rxm = createWritableClient();
        expect(rxm.readOnly).toBe(false);
    });

    it('writable client still has webhooks', () => {
        const rxm = createWritableClient();
        expect(rxm.webhooks).toBeDefined();
    });

    it('writable client validation still works', async () => {
        const rxm = createWritableClient();
        await expect(
            rxm.record('test', { modelId: '' }),
        ).rejects.toThrow(RxMValidationError);
    });
});
