import { describe, it, expect, vi } from 'vitest';
import { batchRequestSchema } from '../src/routes/schemas/batchRecordSchema.js';

/**
 * Tests para POST /v1/records/batch (Issue #12).
 *
 * Dos grupos:
 * 1. Schema validation — batchRequestSchema (Zod)
 * 2. Error factory tests
 */

// --- Fixture: record válido completo ---
const validRecord = {
    content_type: 'text/plain',
    visibility: 'proof_only',
    tags: ['test'],
    fee_amount: 0.001,
    fee_currency: 'MATIC',
    fee_tx_hash: '0x' + 'ab'.repeat(32),
    pog_bundle: {
        schema: 'pog.v1',
        content_hash: 'sha256:' + 'cd'.repeat(32),
        agent_wallet: '0xDd688C11a20e1aDa37CC4A6e4492D5A22bE23A47',
        model_id: 'openai:gpt-4:2026-01',
        runtime_id: 'node-22.x',
        generation_process: {
            process_type: 'direct',
            human_intervention_level: 0,
            pipeline_steps: 1,
        },
        timestamp: '2026-01-01T00:00:00.000Z',
        nonce: 'test-nonce-batch-001',
        signature: '0x' + 'ef'.repeat(65),
    },
};

// =============================================
// batchRequestSchema — Validation Tests
// =============================================

describe('batchRequestSchema (Issue #12)', () => {

    it('acepta batch con 1 record válido', () => {
        const result = batchRequestSchema.safeParse({
            records: [validRecord],
        });
        expect(result.success).toBe(true);
    });

    it('acepta batch con 3 records válidos', () => {
        const records = [
            validRecord,
            {
                ...validRecord,
                fee_tx_hash: '0x' + 'bb'.repeat(32),
                pog_bundle: {
                    ...validRecord.pog_bundle,
                    content_hash: 'sha256:' + 'dd'.repeat(32),
                    nonce: 'test-nonce-batch-002',
                },
            },
            {
                ...validRecord,
                fee_tx_hash: '0x' + 'cc'.repeat(32),
                pog_bundle: {
                    ...validRecord.pog_bundle,
                    content_hash: 'sha256:' + 'ee'.repeat(32),
                    nonce: 'test-nonce-batch-003',
                },
            },
        ];
        const result = batchRequestSchema.safeParse({ records });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.records).toHaveLength(3);
        }
    });

    it('rechaza batch vacío (0 records)', () => {
        const result = batchRequestSchema.safeParse({
            records: [],
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toContain('at least 1');
        }
    });

    it('rechaza batch con más de 100 records', () => {
        const records = Array.from({ length: 101 }, (_, i) => ({
            ...validRecord,
            fee_tx_hash: '0x' + i.toString(16).padStart(64, '0'),
            pog_bundle: {
                ...validRecord.pog_bundle,
                content_hash: 'sha256:' + i.toString(16).padStart(64, '0'),
                nonce: `test-nonce-batch-${i.toString().padStart(6, '0')}`,
            },
        }));

        const result = batchRequestSchema.safeParse({ records });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toContain('100');
        }
    });

    it('rechaza si falta el campo records', () => {
        const result = batchRequestSchema.safeParse({});
        expect(result.success).toBe(false);
    });

    it('rechaza si records no es array', () => {
        const result = batchRequestSchema.safeParse({
            records: 'not-an-array',
        });
        expect(result.success).toBe(false);
    });

    it('rechaza si un record individual tiene pog_bundle inválido', () => {
        const result = batchRequestSchema.safeParse({
            records: [{
                ...validRecord,
                pog_bundle: {
                    ...validRecord.pog_bundle,
                    content_hash: 'invalid-hash',
                },
            }],
        });
        expect(result.success).toBe(false);
    });

    it('acepta batch de exactamente 100 records', () => {
        const records = Array.from({ length: 100 }, (_, i) => ({
            ...validRecord,
            fee_tx_hash: '0x' + i.toString(16).padStart(64, '0'),
            pog_bundle: {
                ...validRecord.pog_bundle,
                content_hash: 'sha256:' + i.toString(16).padStart(64, '0'),
                nonce: `test-nonce-batch-${i.toString().padStart(6, '0')}`,
            },
        }));

        const result = batchRequestSchema.safeParse({ records });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.records).toHaveLength(100);
        }
    });

    it('acepta record con provenance_metadata y pki_timestamp en batch', () => {
        const result = batchRequestSchema.safeParse({
            records: [{
                ...validRecord,
                provenance_metadata: {
                    standard: 'c2pa',
                    manifest_hash: 'sha256:' + 'ff'.repeat(32),
                    pki_timestamp: '2026-02-16T10:00:00.000Z',
                },
            }],
        });
        expect(result.success).toBe(true);
    });

    it('rechaza record con fee_amount negativo en batch', () => {
        const result = batchRequestSchema.safeParse({
            records: [{
                ...validRecord,
                fee_amount: -1,
            }],
        });
        expect(result.success).toBe(false);
    });
});

// =============================================
// Error factories — Batch
// =============================================

describe('Batch error factories (Issue #12)', () => {
    it('batchEmpty devuelve 400 con código correcto', async () => {
        const { batchEmpty } = await import('../src/utils/errors.js');
        const err = batchEmpty();
        expect(err.statusCode).toBe(400);
        expect(err.code).toBe('batch_empty');
    });

    it('batchTooLarge devuelve 400 con código correcto', async () => {
        const { batchTooLarge } = await import('../src/utils/errors.js');
        const err = batchTooLarge();
        expect(err.statusCode).toBe(400);
        expect(err.code).toBe('batch_too_large');
    });

    it('batchInvalidPayload incluye details', async () => {
        const { batchInvalidPayload } = await import('../src/utils/errors.js');
        const err = batchInvalidPayload({ field: 'records', issue: 'Required' });
        expect(err.statusCode).toBe(400);
        expect(err.code).toBe('batch_invalid_payload');
        expect(err.details).toEqual({ field: 'records', issue: 'Required' });
    });
});
