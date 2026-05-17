// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '../src/utils/errors.js';

/**
 * Regression tests for PaymentVerifier (PR #49 follow-up).
 *
 * These tests cover the two critical bugs fixed in PR #49:
 * 1. paymentIdentifier = null for legacy_eth → collides with NULLS NOT DISTINCT
 * 2. Raw Postgres 23505 errors propagating as 500 instead of controlled ApiError
 *
 * Mock strategy: We mock the Drizzle db module to intercept INSERT calls
 * and capture the values passed to .values(). This tests behavior, not just
 * that a function was called.
 */

// --- Hoisted mocks ---
const mockVerifyFee = vi.fn();
let capturedInsertValues: Record<string, unknown> | null = null;
let shouldInsertThrow: Error | null = null;

// Mock the fee service
vi.mock('../src/services/fee.js', () => ({
    verifyFee: (...args: unknown[]) => mockVerifyFee(...args),
}));

// Mock drizzle-orm db with builder chain capture
vi.mock('../src/db/index.js', () => {
    const createReturningMock = () => ({
        returning: vi.fn().mockImplementation(async () => {
            if (shouldInsertThrow) {
                throw shouldInsertThrow;
            }
            return [{
                id: 'attempt-uuid-001',
                contentHash: capturedInsertValues?.contentHash ?? '',
                method: capturedInsertValues?.method ?? '',
                status: capturedInsertValues?.status ?? 'pending',
                paymentIdentifier: capturedInsertValues?.paymentIdentifier ?? null,
                txHash: capturedInsertValues?.txHash ?? null,
                amountAtomic: null,
                decimals: null,
                currency: null,
                receipt: null,
                error: null,
                createdAt: new Date(),
                updatedAt: new Date(),
                idempotencyKey: null,
                recordId: null,
            }];
        }),
    });

    const createValuesMock = () => ({
        values: vi.fn().mockImplementation((vals: Record<string, unknown>) => {
            capturedInsertValues = vals;
            return createReturningMock();
        }),
    });

    const createSetMock = () => ({
        set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([{
                    id: 'attempt-uuid-001',
                    status: 'settled',
                    amountAtomic: '10000000000000000',
                    currency: 'ETH',
                }]),
            }),
        }),
    });

    return {
        db: {
            insert: vi.fn().mockReturnValue(createValuesMock()),
            update: vi.fn().mockReturnValue(createSetMock()),
            select: vi.fn().mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockReturnValue({
                        limit: vi.fn().mockResolvedValue([]),
                    }),
                }),
            }),
        },
    };
});

// Mock drizzle-orm operators
vi.mock('drizzle-orm', () => ({
    eq: vi.fn((_col: unknown, val: unknown) => ({ _type: 'eq', val })),
}));

// Mock the schema (needed for import resolution)
vi.mock('../src/db/schema.js', () => ({
    paymentAttempts: { id: 'id', contentHash: 'content_hash' },
    records: { contentHash: 'content_hash', paymentAttemptId: 'payment_attempt_id' },
}));

// Import AFTER mocks
const { PaymentVerifier } = await import('../src/services/paymentVerifier.js');

beforeEach(() => {
    vi.clearAllMocks();
    capturedInsertValues = null;
    shouldInsertThrow = null;
});

// =========================================================
// Test 2: legacy_eth uses txHash as paymentIdentifier
// =========================================================

describe('PaymentVerifier.verifyAndSettle — paymentIdentifier assignment', () => {
    it('legacy_eth uses txHash as paymentIdentifier, never null (PR #49 regression)', async () => {
        const LEGACY_EVIDENCE = {
            method: 'legacy_eth' as const,
            txHash: '0x' + 'ab'.repeat(32),
        };

        mockVerifyFee.mockResolvedValue({
            verified: true,
            amount: '10000000000000000',
            recipient: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
            blockNumber: 100n,
            confirmedAt: new Date(),
        });

        const verifier = new PaymentVerifier();
        await verifier.verifyAndSettle(LEGACY_EVIDENCE, 'sha256:' + 'aa'.repeat(32));

        // CRITICAL: paymentIdentifier MUST be the txHash, NOT null
        // Before PR #49, legacy_eth had paymentIdentifier = null
        // which collided with NULLS NOT DISTINCT on the unique index
        expect(capturedInsertValues).not.toBeNull();
        expect(capturedInsertValues!.paymentIdentifier).toBe(LEGACY_EVIDENCE.txHash);
        expect(capturedInsertValues!.paymentIdentifier).not.toBeNull();
        expect(capturedInsertValues!.method).toBe('legacy_eth');
        expect(capturedInsertValues!.txHash).toBe(LEGACY_EVIDENCE.txHash);
    });

    it('x402_usdc uses paymentIdentifier from evidence, not txHash', async () => {
        // Re-import with fresh mock for x402 path
        // Since x402 dynamically imports x402Verifier, we mock that too
        vi.doMock('../src/services/x402Verifier.js', () => ({
            x402Verifier: {
                verifyAndSettle: vi.fn().mockResolvedValue({
                    amount: '1000000',
                    transaction: '0xtx',
                    network: 'base-sepolia',
                    payer: '0xpayer',
                }),
            },
        }));

        const X402_EVIDENCE = {
            method: 'x402_usdc' as const,
            paymentSignature: 'sig-data',
            paymentIdentifier: 'x402-payment-id-unique',
        };

        const verifier = new PaymentVerifier();
        await verifier.verifyAndSettle(X402_EVIDENCE, 'sha256:' + 'bb'.repeat(32));

        expect(capturedInsertValues).not.toBeNull();
        expect(capturedInsertValues!.paymentIdentifier).toBe('x402-payment-id-unique');
        expect(capturedInsertValues!.paymentIdentifier).not.toBeNull();
        expect(capturedInsertValues!.method).toBe('x402_usdc');
        // x402 should NOT populate txHash
        expect(capturedInsertValues!.txHash).toBeNull();
    });
});

// =========================================================
// Test 3: Duplicate paymentIdentifier → 409 fee_tx_reused
// =========================================================

describe('PaymentVerifier.verifyAndSettle — duplicate paymentIdentifier', () => {
    it('duplicate paymentIdentifier produces ApiError fee_tx_reused with HTTP 409', async () => {
        // Simulate Postgres 23505 on the INSERT to payment_attempts
        // This is what happens when the same txHash is used twice
        const pgError = new Error('duplicate key value violates unique constraint "idx_pa_payment_identifier"');
        Object.assign(pgError, {
            code: '23505',
            constraint_name: 'idx_pa_payment_identifier',
            detail: 'Key (payment_identifier)=(0xabcdef) already exists.',
        });
        shouldInsertThrow = pgError;

        const LEGACY_EVIDENCE = {
            method: 'legacy_eth' as const,
            txHash: '0x' + 'ab'.repeat(32),
        };

        const verifier = new PaymentVerifier();

        try {
            await verifier.verifyAndSettle(LEGACY_EVIDENCE, 'sha256:' + 'cc'.repeat(32));
            expect.unreachable('should have thrown');
        } catch (e) {
            // Must be a controlled ApiError, NOT a raw PG error
            expect(e).toBeInstanceOf(ApiError);
            expect((e as ApiError).statusCode).toBe(409);
            expect((e as ApiError).code).toBe('fee_tx_reused');
        }
    });

    it('23505 on a DIFFERENT constraint re-throws raw (not fee_tx_reused) for observability', async () => {
        // A 23505 on another constraint (e.g. content_hash uniqueness)
        // must NOT be swallowed as fee_tx_reused — it reveals a different bug.
        const otherPgError = new Error('duplicate key value violates unique constraint "payment_attempts_content_hash_key"');
        Object.assign(otherPgError, {
            code: '23505',
            constraint_name: 'payment_attempts_content_hash_key',
            detail: 'Key (content_hash)=(sha256:abc) already exists.',
        });
        shouldInsertThrow = otherPgError;

        const LEGACY_EVIDENCE = {
            method: 'legacy_eth' as const,
            txHash: '0x' + 'ee'.repeat(32),
        };

        const verifier = new PaymentVerifier();

        try {
            await verifier.verifyAndSettle(LEGACY_EVIDENCE, 'sha256:' + 'ee'.repeat(32));
            expect.unreachable('should have thrown');
        } catch (e) {
            // Must NOT be ApiError — this is an unexpected constraint violation
            expect(e).not.toBeInstanceOf(ApiError);
            // Must be the original PG error, untouched
            expect((e as Error).message).toContain('payment_attempts_content_hash_key');
        }
    });
});

// =========================================================
// Test 4: Raw Postgres 23505 is sanitized (no leak)
// =========================================================

describe('PaymentVerifier.verifyAndSettle — 23505 error sanitization', () => {
    it('raw Postgres 23505 object is sanitized: no constraint dump, no stack, no raw DB error', async () => {
        // Create a realistic raw PG error with sensitive data
        const rawPgError = new Error('duplicate key value violates unique constraint "idx_pa_payment_identifier"');
        Object.assign(rawPgError, {
            code: '23505',
            constraint_name: 'idx_pa_payment_identifier',
            detail: 'Key (payment_identifier)=(0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef) already exists.',
            schema: 'public',
            table: 'payment_attempts',
            column: undefined,
            dataType: undefined,
            severity: 'ERROR',
            routine: '_bt_check_unique',
        });
        shouldInsertThrow = rawPgError;

        const LEGACY_EVIDENCE = {
            method: 'legacy_eth' as const,
            txHash: '0x' + 'dd'.repeat(32),
        };

        const verifier = new PaymentVerifier();

        try {
            await verifier.verifyAndSettle(LEGACY_EVIDENCE, 'sha256:' + 'dd'.repeat(32));
            expect.unreachable('should have thrown');
        } catch (e) {
            const error = e as ApiError;

            // Must be ApiError, not raw Error
            expect(error).toBeInstanceOf(ApiError);

            // Error code must be stable and documented
            expect(error.code).toBe('fee_tx_reused');

            // The error message must NOT contain:
            const errorJson = JSON.stringify(error.toJSON());
            
            // No raw SQL constraint name
            expect(errorJson).not.toContain('idx_pa_payment_identifier');
            
            // No raw PG error message
            expect(errorJson).not.toContain('duplicate key value violates unique constraint');
            
            // No stack trace
            expect(errorJson).not.toContain('_bt_check_unique');
            
            // No raw PG error object fields
            expect(errorJson).not.toContain('"schema":"public"');
            expect(errorJson).not.toContain('"table":"payment_attempts"');
        }
    });
});
