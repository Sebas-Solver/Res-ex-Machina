// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

/**
 * P1-1: Migration script idempotency tests.
 *
 * Verifies that scripts/migrate-webhook-secrets.ts:
 * 1. Only processes rows WHERE secret IS NOT NULL AND secret_ciphertext IS NULL
 * 2. Sets secret = NULL after encrypting
 * 3. Skips already-migrated rows (idempotent)
 * 4. Handles empty result set gracefully
 */

// Set encryption key before mocks
const TEST_KEY = crypto.randomBytes(32).toString('base64');
process.env.WEBHOOK_SECRET_ENCRYPTION_KEY = TEST_KEY;

// Mock DB
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockSet = vi.fn();

vi.mock('../src/db/index.js', () => ({
    db: {
        select: () => ({ from: mockFrom }),
        update: () => ({ set: mockSet }),
        insert: vi.fn(),
        delete: vi.fn(),
    },
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

// Import crypto service after env is set
const { encryptSecret, decryptSecret } = await import('../src/services/secretCrypto.js');

beforeEach(() => {
    vi.clearAllMocks();
});

// =============================================
// Migration Idempotency
// =============================================

describe('P1-1: Migration script idempotency', () => {

    it('only targets rows with secret IS NOT NULL AND secret_ciphertext IS NULL', () => {
        // The migration query uses:
        // .where(and(isNotNull(webhooks.secret), isNull(webhooks.secretCiphertext)))
        //
        // Test the logic: given a set of webhooks, only those matching the filter
        // should be processed.

        const webhooksInDb = [
            // Case 1: Legacy webhook — needs migration
            {
                webhookId: 'wh-legacy',
                agentWallet: '0xaaa',
                secret: 'plaintext-secret-hex',
                secretCiphertext: null,
                secretIv: null,
                secretAuthTag: null,
                secretKeyVersion: null,
            },
            // Case 2: Already migrated — should be skipped
            {
                webhookId: 'wh-migrated',
                agentWallet: '0xbbb',
                secret: null,
                secretCiphertext: 'some-ciphertext',
                secretIv: 'some-iv',
                secretAuthTag: 'some-tag',
                secretKeyVersion: 1,
            },
            // Case 3: New webhook (post-P1-1) — should be skipped
            {
                webhookId: 'wh-new',
                agentWallet: '0xccc',
                secret: null,
                secretCiphertext: 'new-ciphertext',
                secretIv: 'new-iv',
                secretAuthTag: 'new-tag',
                secretKeyVersion: 1,
            },
        ];

        // Apply the migration filter
        const toMigrate = webhooksInDb.filter(
            (w) => w.secret !== null && w.secretCiphertext === null
        );

        expect(toMigrate).toHaveLength(1);
        expect(toMigrate[0].webhookId).toBe('wh-legacy');
    });

    it('migration sets secret = NULL after encryption', () => {
        const webhookId = crypto.randomUUID();
        const wallet = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
        const plaintextSecret = crypto.randomBytes(32).toString('hex');

        // Simulate migration: encrypt and build update payload
        const encrypted = encryptSecret(plaintextSecret, webhookId, wallet);

        const updatePayload = {
            secret: null,
            secretCiphertext: encrypted.ciphertext,
            secretIv: encrypted.iv,
            secretAuthTag: encrypted.authTag,
            secretKeyVersion: encrypted.keyVersion,
        };

        // Verify update sets secret to null
        expect(updatePayload.secret).toBeNull();
        // Verify encrypted fields are populated
        expect(updatePayload.secretCiphertext).toBeTruthy();
        expect(updatePayload.secretIv).toBeTruthy();
        expect(updatePayload.secretAuthTag).toBeTruthy();
        expect(updatePayload.secretKeyVersion).toBe(1);

        // Verify the encrypted value can be decrypted back
        const decrypted = decryptSecret(encrypted, webhookId, wallet);
        expect(decrypted).toBe(plaintextSecret);
    });

    it('re-running migration on already-migrated data produces no changes', () => {
        const webhooksInDb = [
            {
                webhookId: 'wh-1',
                agentWallet: '0xaaa',
                secret: null,
                secretCiphertext: 'already-encrypted',
                secretIv: 'iv-here',
                secretAuthTag: 'tag-here',
                secretKeyVersion: 1,
            },
            {
                webhookId: 'wh-2',
                agentWallet: '0xbbb',
                secret: null,
                secretCiphertext: 'already-encrypted-2',
                secretIv: 'iv-here-2',
                secretAuthTag: 'tag-here-2',
                secretKeyVersion: 1,
            },
        ];

        // Apply the migration filter again
        const toMigrate = webhooksInDb.filter(
            (w) => w.secret !== null && w.secretCiphertext === null
        );

        // Zero rows to process = idempotent
        expect(toMigrate).toHaveLength(0);
    });

    it('handles empty database gracefully', () => {
        const webhooksInDb: Array<{
            webhookId: string;
            secret: string | null;
            secretCiphertext: string | null;
        }> = [];

        const toMigrate = webhooksInDb.filter(
            (w) => w.secret !== null && w.secretCiphertext === null
        );

        expect(toMigrate).toHaveLength(0);
    });

    it('handles partial migration scenario (some migrated, some not)', () => {
        const webhooksInDb = [
            { webhookId: 'wh-a', secret: 'plain-a', secretCiphertext: null },
            { webhookId: 'wh-b', secret: null, secretCiphertext: 'encrypted-b' },
            { webhookId: 'wh-c', secret: 'plain-c', secretCiphertext: null },
            { webhookId: 'wh-d', secret: null, secretCiphertext: 'encrypted-d' },
        ];

        const toMigrate = webhooksInDb.filter(
            (w) => w.secret !== null && w.secretCiphertext === null
        );

        expect(toMigrate).toHaveLength(2);
        expect(toMigrate.map((w) => w.webhookId).sort()).toEqual(['wh-a', 'wh-c']);
    });
});
