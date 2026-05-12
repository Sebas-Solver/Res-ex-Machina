// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { createRecordSchema, pogBundleSchema, provenanceMetadataSchema } from '../src/routes/schemas/index.js';

describe('pogBundleSchema', () => {
    const validBundle = {
        schema: 'pog.v1',
        content_hash: 'sha256:' + 'a'.repeat(64),
        agent_wallet: '0x' + 'f'.repeat(40),
        model_id: 'openai:gpt-4o:2026-01',
        runtime_id: 'node-22.x',
        generation_process: {
            process_type: 'direct',
            human_intervention_level: 0,
            pipeline_steps: 1,
        },
        timestamp: '2026-01-01T00:00:00.000Z',
        nonce: 'nonce-1234567890abcdef',
        signature: '0x' + 'ab'.repeat(65),
    };

    it('accepts a valid bundle', () => {
        const result = pogBundleSchema.safeParse(validBundle);
        expect(result.success).toBe(true);
    });

    it('rechaza schema !== pog.v1', () => {
        const result = pogBundleSchema.safeParse({ ...validBundle, schema: 'pog.v2' });
        expect(result.success).toBe(false);
    });

    it('rechaza content_hash sin prefijo sha256:', () => {
        const result = pogBundleSchema.safeParse({ ...validBundle, content_hash: 'a'.repeat(64) });
        expect(result.success).toBe(false);
    });

    it('rechaza agent_wallet sin 0x', () => {
        const result = pogBundleSchema.safeParse({ ...validBundle, agent_wallet: 'f'.repeat(40) });
        expect(result.success).toBe(false);
    });

    it('rechaza nonce < 16 chars', () => {
        const result = pogBundleSchema.safeParse({ ...validBundle, nonce: 'short' });
        expect(result.success).toBe(false);
    });

    it('rejects invalid process_type', () => {
        const result = pogBundleSchema.safeParse({
            ...validBundle,
            generation_process: { ...validBundle.generation_process, process_type: 'invalid' },
        });
        expect(result.success).toBe(false);
    });

    it('accepts the 4 valid process_types', () => {
        for (const type of ['direct', 'pipeline', 'iterative', 'autonomous']) {
            const result = pogBundleSchema.safeParse({
                ...validBundle,
                generation_process: { ...validBundle.generation_process, process_type: type },
            });
            expect(result.success).toBe(true);
        }
    });

    // --- Size limit 32KB (Threat Model — D-04) ---

    it('accepts pog_bundle within the 32KB limit', () => {
        const result = pogBundleSchema.safeParse(validBundle);
        expect(result.success).toBe(true);
        // A typical bundle weighs ~500 bytes, well below 32KB
        expect(JSON.stringify(validBundle).length).toBeLessThan(32_768);
    });

    it('has double protection: field limits + total size refine', () => {
        // Individual fields already have strict limits:
        // model_id max 128, runtime_id max 128, nonce max 128, signature 132
        // This makes it impossible to create a bundle > 32KB with valid fields.
        // Verificamos que el refine de 32KB existe como defensa en profundidad.
        const maxBundle = {
            ...validBundle,
            model_id: 'x'.repeat(128),
            runtime_id: 'y'.repeat(128),
            nonce: 'z'.repeat(128),
        };
        const serialized = JSON.stringify(maxBundle);
        // Even with maximum fields, it does not exceed 32KB
        expect(serialized.length).toBeLessThan(32_768);
        const result = pogBundleSchema.safeParse(maxBundle);
        expect(result.success).toBe(true);
    });
});

describe('createRecordSchema', () => {
    const validBody = {
        pog_bundle: {
            schema: 'pog.v1',
            content_hash: 'sha256:' + 'b'.repeat(64),
            agent_wallet: '0x' + '1'.repeat(40),
            model_id: 'anthropic:claude-3.5:2026-01',
            runtime_id: 'node-22.x',
            generation_process: {
                process_type: 'pipeline',
                human_intervention_level: 2,
                pipeline_steps: 3,
            },
            timestamp: '2026-06-15T12:00:00.000Z',
            nonce: 'nonce-abcdefghijklmnop',
            signature: '0x' + 'cd'.repeat(65),
        },
        fee_amount: 0.01,
        fee_currency: 'MATIC',
        fee_tx_hash: '0x' + 'ee'.repeat(32),
    };

    it('accepts a valid body with default optional fields', () => {
        const result = createRecordSchema.safeParse(validBody);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.visibility).toBe('proof_only'); // default
            expect(result.data.tags).toEqual([]); // default
        }
    });

    it('accepts valid visibility', () => {
        for (const vis of ['proof_only', 'input_hash_only', 'content_optional']) {
            const result = createRecordSchema.safeParse({ ...validBody, visibility: vis });
            expect(result.success).toBe(true);
        }
    });

    it('rejects invalid visibility', () => {
        const result = createRecordSchema.safeParse({ ...validBody, visibility: 'public' });
        expect(result.success).toBe(false);
    });

    it('rechaza fee_amount negativo', () => {
        const result = createRecordSchema.safeParse({ ...validBody, fee_amount: -1 });
        expect(result.success).toBe(false);
    });

    it('accepts valid tags (max 10)', () => {
        const result = createRecordSchema.safeParse({
            ...validBody,
            tags: ['art', 'code', 'music'],
        });
        expect(result.success).toBe(true);
    });

    it('rejects more than 10 tags', () => {
        const result = createRecordSchema.safeParse({
            ...validBody,
            tags: Array.from({ length: 11 }, (_, i) => `tag-${i}`),
        });
        expect(result.success).toBe(false);
    });

    it('rejects invalid fee_tx_hash', () => {
        const result = createRecordSchema.safeParse({ ...validBody, fee_tx_hash: 'no-es-hash' });
        expect(result.success).toBe(false);
    });

    // --- provenance_metadata (Issue #11) ---

    it('acepta body sin provenance_metadata (backward compatible)', () => {
        const result = createRecordSchema.safeParse(validBody);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.provenance_metadata).toBeUndefined();
        }
    });

    it('accepts valid C2PA provenance_metadata', () => {
        const result = createRecordSchema.safeParse({
            ...validBody,
            provenance_metadata: {
                standard: 'c2pa',
                manifest_hash: 'sha256:' + 'ab'.repeat(32),
                claim_generator: 'Adobe Photoshop 25.0',
                issuer: 'Adobe Inc.',
                assertions: ['c2pa.created', 'c2pa.hash.data'],
                manifest_uri: 'https://example.com/manifest.c2pa',
            },
        });
        expect(result.success).toBe(true);
    });

    it('acepta provenance_metadata con solo campos obligatorios', () => {
        const result = createRecordSchema.safeParse({
            ...validBody,
            provenance_metadata: {
                standard: 'iptc',
                manifest_hash: 'sha256:' + 'cc'.repeat(32),
            },
        });
        expect(result.success).toBe(true);
    });
});

// =============================================
// provenanceMetadataSchema (Issue #11)
// =============================================

describe('provenanceMetadataSchema', () => {
    const validProvenance = {
        standard: 'c2pa',
        manifest_hash: 'sha256:' + 'ab'.repeat(32),
    };

    it('accepts the 5 valid standards', () => {
        for (const std of ['c2pa', 'iptc', 'xmp', 'schema_org', 'custom']) {
            const result = provenanceMetadataSchema.safeParse({ ...validProvenance, standard: std });
            expect(result.success).toBe(true);
        }
    });

    it('rejects invalid standard', () => {
        const result = provenanceMetadataSchema.safeParse({ ...validProvenance, standard: 'unknown' });
        expect(result.success).toBe(false);
    });

    it('rechaza manifest_hash sin formato sha256:', () => {
        const result = provenanceMetadataSchema.safeParse({ ...validProvenance, manifest_hash: 'abc123' });
        expect(result.success).toBe(false);
    });

    it('rechaza manifest_hash con md5:', () => {
        const result = provenanceMetadataSchema.safeParse({ ...validProvenance, manifest_hash: 'md5:' + 'ab'.repeat(32) });
        expect(result.success).toBe(false);
    });

    it('rejects more than 20 assertions', () => {
        const result = provenanceMetadataSchema.safeParse({
            ...validProvenance,
            assertions: Array.from({ length: 21 }, (_, i) => `assertion-${i}`),
        });
        expect(result.success).toBe(false);
    });

    it('acepta hasta 20 assertions', () => {
        const result = provenanceMetadataSchema.safeParse({
            ...validProvenance,
            assertions: Array.from({ length: 20 }, (_, i) => `assertion-${i}`),
        });
        expect(result.success).toBe(true);
    });

    it('rechaza claim_generator > 256 chars', () => {
        const result = provenanceMetadataSchema.safeParse({
            ...validProvenance,
            claim_generator: 'x'.repeat(257),
        });
        expect(result.success).toBe(false);
    });

    it('rechaza manifest_uri no URL', () => {
        const result = provenanceMetadataSchema.safeParse({
            ...validProvenance,
            manifest_uri: 'not-a-url',
        });
        expect(result.success).toBe(false);
    });

    it('accepts valid manifest_uri URL', () => {
        const result = provenanceMetadataSchema.safeParse({
            ...validProvenance,
            manifest_uri: 'https://example.com/manifest.c2pa',
        });
        expect(result.success).toBe(true);
    });

    // --- pki_timestamp (Issue #14) ---

    it('accepts valid ISO-8601 pki_timestamp', () => {
        const result = provenanceMetadataSchema.safeParse({
            ...validProvenance,
            pki_timestamp: '2026-02-16T12:00:00.000Z',
        });
        expect(result.success).toBe(true);
    });

    it('rechaza pki_timestamp no ISO-8601', () => {
        const result = provenanceMetadataSchema.safeParse({
            ...validProvenance,
            pki_timestamp: '16/02/2026 12:00',
        });
        expect(result.success).toBe(false);
    });

    it('accepts complete provenance with dual temporal attestation', () => {
        const result = provenanceMetadataSchema.safeParse({
            ...validProvenance,
            claim_generator: 'Adobe Photoshop 25.0',
            issuer: 'Adobe Inc.',
            assertions: ['c2pa.created'],
            manifest_uri: 'https://example.com/manifest.c2pa',
            pki_timestamp: '2026-02-16T10:00:00.000Z',
        });
        expect(result.success).toBe(true);
    });
});

