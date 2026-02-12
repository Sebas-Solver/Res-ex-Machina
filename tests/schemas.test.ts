import { describe, it, expect } from 'vitest';
import { createRecordSchema, pogBundleSchema } from '../src/routes/schemas/index.js';

describe('pogBundleSchema', () => {
    const validBundle = {
        schema: 'pog.v1',
        content_hash: 'sha256:' + 'a'.repeat(64),
        agent_wallet: '0x' + 'f'.repeat(40),
        model_id: 'gpt-4o',
        runtime_id: 'openai-api-v1',
        generation_process: {
            process_type: 'direct',
            human_intervention_level: 0,
            pipeline_steps: 1,
        },
        timestamp: '2026-01-01T00:00:00.000Z',
        nonce: 'nonce-1234567890abcdef',
        signature: '0x' + 'ab'.repeat(65),
    };

    it('acepta un bundle válido', () => {
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

    it('rechaza process_type inválido', () => {
        const result = pogBundleSchema.safeParse({
            ...validBundle,
            generation_process: { ...validBundle.generation_process, process_type: 'invalid' },
        });
        expect(result.success).toBe(false);
    });

    it('acepta los 4 process_types válidos', () => {
        for (const type of ['direct', 'pipeline', 'iterative', 'autonomous']) {
            const result = pogBundleSchema.safeParse({
                ...validBundle,
                generation_process: { ...validBundle.generation_process, process_type: type },
            });
            expect(result.success).toBe(true);
        }
    });
});

describe('createRecordSchema', () => {
    const validBody = {
        pog_bundle: {
            schema: 'pog.v1',
            content_hash: 'sha256:' + 'b'.repeat(64),
            agent_wallet: '0x' + '1'.repeat(40),
            model_id: 'claude-3.5',
            runtime_id: 'anthropic-v1',
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

    it('acepta un body válido con campos opcionales por defecto', () => {
        const result = createRecordSchema.safeParse(validBody);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.visibility).toBe('proof_only'); // default
            expect(result.data.tags).toEqual([]); // default
        }
    });

    it('acepta visibility válida', () => {
        for (const vis of ['proof_only', 'input_hash_only', 'content_optional']) {
            const result = createRecordSchema.safeParse({ ...validBody, visibility: vis });
            expect(result.success).toBe(true);
        }
    });

    it('rechaza visibility inválida', () => {
        const result = createRecordSchema.safeParse({ ...validBody, visibility: 'public' });
        expect(result.success).toBe(false);
    });

    it('rechaza fee_amount negativo', () => {
        const result = createRecordSchema.safeParse({ ...validBody, fee_amount: -1 });
        expect(result.success).toBe(false);
    });

    it('acepta tags válidas (max 10)', () => {
        const result = createRecordSchema.safeParse({
            ...validBody,
            tags: ['art', 'code', 'music'],
        });
        expect(result.success).toBe(true);
    });

    it('rechaza más de 10 tags', () => {
        const result = createRecordSchema.safeParse({
            ...validBody,
            tags: Array.from({ length: 11 }, (_, i) => `tag-${i}`),
        });
        expect(result.success).toBe(false);
    });

    it('rechaza fee_tx_hash inválido', () => {
        const result = createRecordSchema.safeParse({ ...validBody, fee_tx_hash: 'no-es-hash' });
        expect(result.success).toBe(false);
    });
});
