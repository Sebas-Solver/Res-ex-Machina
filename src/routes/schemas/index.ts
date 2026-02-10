import { z } from 'zod';

// --- Regex patterns ---
const CONTENT_HASH_REGEX = /^sha256:[a-f0-9]{64}$/;
const ETH_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const TX_HASH_REGEX = /^0x[a-fA-F0-9]{64}$/;

/**
 * Schema del proceso de generación dentro del PoG.
 */
const generationProcessSchema = z.object({
    process_type: z.enum(['direct', 'pipeline', 'iterative', 'autonomous']),
    human_intervention_level: z.number().int().min(0).max(5),
    pipeline_steps: z.number().int().min(1),
});

/**
 * Schema del PoG v1 bundle.
 * Referencia: pog-v1-spec.md sección 2
 */
export const pogBundleSchema = z.object({
    schema: z.literal('pog.v1'),
    content_hash: z.string().regex(CONTENT_HASH_REGEX, 'Must match sha256:{64hex}'),
    agent_wallet: z.string().regex(ETH_ADDRESS_REGEX, 'Must be valid EVM address'),
    model_id: z.string().min(1),
    runtime_id: z.string().min(1),
    generation_process: generationProcessSchema,
    timestamp: z.string().datetime({ message: 'Must be ISO-8601 with timezone' }),
    nonce: z.string().min(16, 'Nonce must be at least 16 characters'),
    signature: z.string().startsWith('0x').min(132, 'Must be valid EIP-712 signature'),
});

export type PogBundle = z.infer<typeof pogBundleSchema>;

/**
 * Schema del body completo del POST /v1/records.
 */
export const createRecordSchema = z.object({
    pog_bundle: pogBundleSchema,
    content_type: z.string().max(64).optional(),
    visibility: z
        .enum(['proof_only', 'input_hash_only', 'content_optional'])
        .default('proof_only'),
    tags: z
        .array(z.string().min(1).max(100))
        .max(10)
        .default([]),
    external_ref: z.string().url().optional(),
    fee_amount: z.number().positive(),
    fee_currency: z.string().min(1).max(8),
    fee_tx_hash: z.string().regex(TX_HASH_REGEX, 'Must be valid transaction hash'),
});

export type CreateRecordInput = z.infer<typeof createRecordSchema>;
