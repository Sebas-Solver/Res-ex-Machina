// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests for the webhook secret encryption service (P1-1).
 *
 * Groups:
 * 1. Crypto roundtrip — encrypt → decrypt produces original plaintext
 * 2. IV uniqueness — two encryptions produce different ciphertexts
 * 3. Auth tag corruption — modified auth_tag causes failure
 * 4. Ciphertext corruption — modified ciphertext causes failure
 * 5. Wrong AAD — decrypting with wrong webhook_id or wallet fails
 * 6. Key version — current version is 1
 * 7. Fail-fast — missing or invalid env var throws at import time
 * 8. Log redaction — error messages never leak sensitive material
 */

// We need to control the env var BEFORE importing secretCrypto,
// because the module validates at import time (fail-fast).
// Generate a valid 32-byte base64 key for the test suite.
import crypto from 'crypto';
const TEST_KEY = crypto.randomBytes(32).toString('base64');

// Set env before any import of secretCrypto
process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = TEST_KEY;

// Mock DB and Redis modules that might be pulled in transitively
vi.mock('../src/db/index.js', () => ({
    db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() },
    client: { end: vi.fn() },
}));

vi.mock('../src/config/redis.js', () => ({
    redisConnectionConfig: {},
    createHealthRedisClient: () => ({}),
    createRateLimitRedisClient: () => ({}),
}));

vi.mock('../src/services/queue.js', () => ({
    enqueueAnchorJob: vi.fn(),
}));

// Import AFTER setting env and mocks
const { encryptSecret, decryptSecret, getKeyVersion } = await import('../src/services/secretCrypto.js');

// --- Fixtures ---
const WEBHOOK_ID = '550e8400-e29b-41d4-a716-446655440000';
const WALLET = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const PLAINTEXT_SECRET = crypto.randomBytes(32).toString('hex'); // 64 hex chars, same as real secrets

// =============================================
// 1. Crypto Roundtrip
// =============================================

describe('secretCrypto — roundtrip (P1-1)', () => {

    it('encrypt → decrypt produces original plaintext', () => {
        const encrypted = encryptSecret(PLAINTEXT_SECRET, WEBHOOK_ID, WALLET);
        const decrypted = decryptSecret(encrypted, WEBHOOK_ID, WALLET);
        expect(decrypted).toBe(PLAINTEXT_SECRET);
    });

    it('works with empty string plaintext', () => {
        const encrypted = encryptSecret('', WEBHOOK_ID, WALLET);
        const decrypted = decryptSecret(encrypted, WEBHOOK_ID, WALLET);
        expect(decrypted).toBe('');
    });

    it('works with very long plaintext', () => {
        const longSecret = 'a'.repeat(1024);
        const encrypted = encryptSecret(longSecret, WEBHOOK_ID, WALLET);
        const decrypted = decryptSecret(encrypted, WEBHOOK_ID, WALLET);
        expect(decrypted).toBe(longSecret);
    });

    it('encrypted output has expected fields', () => {
        const encrypted = encryptSecret(PLAINTEXT_SECRET, WEBHOOK_ID, WALLET);
        expect(encrypted).toHaveProperty('ciphertext');
        expect(encrypted).toHaveProperty('iv');
        expect(encrypted).toHaveProperty('authTag');
        expect(encrypted).toHaveProperty('keyVersion');
        expect(typeof encrypted.ciphertext).toBe('string');
        expect(typeof encrypted.iv).toBe('string');
        expect(typeof encrypted.authTag).toBe('string');
        expect(typeof encrypted.keyVersion).toBe('number');
    });

    it('IV is 24 hex chars (12 bytes)', () => {
        const encrypted = encryptSecret(PLAINTEXT_SECRET, WEBHOOK_ID, WALLET);
        expect(encrypted.iv).toMatch(/^[a-f0-9]{24}$/);
    });

    it('auth tag is 32 hex chars (16 bytes)', () => {
        const encrypted = encryptSecret(PLAINTEXT_SECRET, WEBHOOK_ID, WALLET);
        expect(encrypted.authTag).toMatch(/^[a-f0-9]{32}$/);
    });
});

// =============================================
// 2. IV Uniqueness
// =============================================

describe('secretCrypto — IV uniqueness (P1-1)', () => {

    it('two encryptions of the same plaintext produce different ciphertexts', () => {
        const enc1 = encryptSecret(PLAINTEXT_SECRET, WEBHOOK_ID, WALLET);
        const enc2 = encryptSecret(PLAINTEXT_SECRET, WEBHOOK_ID, WALLET);
        expect(enc1.ciphertext).not.toBe(enc2.ciphertext);
        expect(enc1.iv).not.toBe(enc2.iv);
    });

    it('both different ciphertexts decrypt to the same plaintext', () => {
        const enc1 = encryptSecret(PLAINTEXT_SECRET, WEBHOOK_ID, WALLET);
        const enc2 = encryptSecret(PLAINTEXT_SECRET, WEBHOOK_ID, WALLET);
        expect(decryptSecret(enc1, WEBHOOK_ID, WALLET)).toBe(PLAINTEXT_SECRET);
        expect(decryptSecret(enc2, WEBHOOK_ID, WALLET)).toBe(PLAINTEXT_SECRET);
    });
});

// =============================================
// 3. Auth Tag Corruption
// =============================================

describe('secretCrypto — auth tag corruption (P1-1)', () => {

    it('corrupted auth_tag → throws', () => {
        const encrypted = encryptSecret(PLAINTEXT_SECRET, WEBHOOK_ID, WALLET);
        const corrupted = { ...encrypted, authTag: 'ff'.repeat(16) };
        expect(() => decryptSecret(corrupted, WEBHOOK_ID, WALLET)).toThrow();
    });

    it('zeroed auth_tag → throws', () => {
        const encrypted = encryptSecret(PLAINTEXT_SECRET, WEBHOOK_ID, WALLET);
        const corrupted = { ...encrypted, authTag: '00'.repeat(16) };
        expect(() => decryptSecret(corrupted, WEBHOOK_ID, WALLET)).toThrow();
    });
});

// =============================================
// 4. Ciphertext Corruption
// =============================================

describe('secretCrypto — ciphertext corruption (P1-1)', () => {

    it('modified ciphertext → throws', () => {
        const encrypted = encryptSecret(PLAINTEXT_SECRET, WEBHOOK_ID, WALLET);
        // Flip first byte
        const flipped = (encrypted.ciphertext[0] === 'a' ? 'b' : 'a') + encrypted.ciphertext.slice(1);
        const corrupted = { ...encrypted, ciphertext: flipped };
        expect(() => decryptSecret(corrupted, WEBHOOK_ID, WALLET)).toThrow();
    });

    it('empty ciphertext → throws', () => {
        const encrypted = encryptSecret(PLAINTEXT_SECRET, WEBHOOK_ID, WALLET);
        const corrupted = { ...encrypted, ciphertext: '' };
        // Empty ciphertext with valid auth tag should fail authentication
        expect(() => decryptSecret(corrupted, WEBHOOK_ID, WALLET)).toThrow();
    });
});

// =============================================
// 5. Wrong AAD (webhook_id / wallet)
// =============================================

describe('secretCrypto — AAD binding (P1-1)', () => {

    it('wrong webhook_id → throws', () => {
        const encrypted = encryptSecret(PLAINTEXT_SECRET, WEBHOOK_ID, WALLET);
        const wrongId = '00000000-0000-0000-0000-000000000000';
        expect(() => decryptSecret(encrypted, wrongId, WALLET)).toThrow();
    });

    it('wrong wallet → throws', () => {
        const encrypted = encryptSecret(PLAINTEXT_SECRET, WEBHOOK_ID, WALLET);
        const wrongWallet = '0x0000000000000000000000000000000000000001';
        expect(() => decryptSecret(encrypted, WEBHOOK_ID, wrongWallet)).toThrow();
    });

    it('swapped webhook_id and wallet → throws', () => {
        const encrypted = encryptSecret(PLAINTEXT_SECRET, WEBHOOK_ID, WALLET);
        expect(() => decryptSecret(encrypted, WALLET, WEBHOOK_ID)).toThrow();
    });

    it('wallet case sensitivity: AAD uses lowercase', () => {
        const mixedCaseWallet = '0xF39FD6E51AAD88F6F4CE6AB8827279CFFFB92266';
        const encrypted = encryptSecret(PLAINTEXT_SECRET, WEBHOOK_ID, mixedCaseWallet);
        // Should decrypt with either case since both are lowered internally
        const decrypted = decryptSecret(encrypted, WEBHOOK_ID, mixedCaseWallet.toLowerCase());
        expect(decrypted).toBe(PLAINTEXT_SECRET);
    });
});

// =============================================
// 6. Key Version
// =============================================

describe('secretCrypto — key version (P1-1)', () => {

    it('current key version is 1', () => {
        expect(getKeyVersion()).toBe(1);
    });

    it('encrypted output has keyVersion = 1', () => {
        const encrypted = encryptSecret(PLAINTEXT_SECRET, WEBHOOK_ID, WALLET);
        expect(encrypted.keyVersion).toBe(1);
    });

    it('unsupported key version → throws', () => {
        const encrypted = encryptSecret(PLAINTEXT_SECRET, WEBHOOK_ID, WALLET);
        const wrongVersion = { ...encrypted, keyVersion: 99 };
        expect(() => decryptSecret(wrongVersion, WEBHOOK_ID, WALLET)).toThrow('Unsupported key version');
    });
});

// =============================================
// 7. Fail-Fast (env var validation)
// =============================================

describe('secretCrypto — fail-fast validation (P1-1)', () => {

    it('missing WEBHOOK_SECRET_ENCRYPTION_KEY → throws at import', async () => {
        // We test this by dynamically importing a fresh module with env cleared.
        // Since vi.resetModules() + dynamic import gives us a fresh module instance.
        const originalKey = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
        delete process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;

        vi.resetModules();

        try {
            await import('../src/services/secretCrypto.js');
            expect.unreachable('should have thrown');
        } catch (e) {
            expect(e).toBeDefined();
            expect((e as Error).message).toContain('WEBHOOK_SECRET_ENCRYPTION_KEY');
        } finally {
            // Restore for other tests
            process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = originalKey;
            vi.resetModules();
        }
    });

    it('invalid key length → throws at import', async () => {
        const originalKey = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
        // 16 bytes instead of 32
        process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = crypto.randomBytes(16).toString('base64');

        vi.resetModules();

        try {
            await import('../src/services/secretCrypto.js');
            expect.unreachable('should have thrown');
        } catch (e) {
            expect(e).toBeDefined();
            expect((e as Error).message).toContain('32 bytes');
        } finally {
            process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = originalKey;
            vi.resetModules();
        }
    });
});

// =============================================
// 8. Log Redaction (007 security requirement)
// =============================================

describe('secretCrypto — log redaction policy (P1-1)', () => {

    it('decryption error does NOT leak ciphertext', () => {
        const encrypted = encryptSecret(PLAINTEXT_SECRET, WEBHOOK_ID, WALLET);
        const corrupted = { ...encrypted, authTag: 'ff'.repeat(16) };

        try {
            decryptSecret(corrupted, WEBHOOK_ID, WALLET);
            expect.unreachable('should have thrown');
        } catch (e) {
            const msg = (e as Error).message;
            // The error message must NOT contain the ciphertext, key, or plaintext
            expect(msg).not.toContain(encrypted.ciphertext);
            expect(msg).not.toContain(PLAINTEXT_SECRET);
            expect(msg).not.toContain(TEST_KEY);
            // It SHOULD contain a generic safe message
            expect(msg).toContain('decryption failed');
        }
    });

    it('decryption error does NOT leak auth tag', () => {
        const encrypted = encryptSecret(PLAINTEXT_SECRET, WEBHOOK_ID, WALLET);
        const corrupted = { ...encrypted, ciphertext: 'aa'.repeat(32) };

        try {
            decryptSecret(corrupted, WEBHOOK_ID, WALLET);
            expect.unreachable('should have thrown');
        } catch (e) {
            const msg = (e as Error).message;
            expect(msg).not.toContain(encrypted.authTag);
        }
    });
});
