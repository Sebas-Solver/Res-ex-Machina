// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';

// --- Regex patterns ---
const CONTENT_HASH_REGEX = /^sha256:[a-f0-9]{64}$/;
const ETH_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const TX_HASH_REGEX = /^0x[a-fA-F0-9]{64}$/;

/**
 * Schema for the generation process within the PoG.
 */
const generationProcessSchema = z.object({
    process_type: z.enum(['direct', 'pipeline', 'iterative', 'autonomous']),
    human_intervention_level: z.number().int().min(0).max(5),
    pipeline_steps: z.number().int().min(1),
});

/**
 * Schema for the PoG v1 bundle.
 * Reference: pog-v1-spec.md section 2
 */
// Maximum size of serialized pog_bundle (Threat Model — D-04)
const POG_BUNDLE_MAX_SIZE = 32_768; // 32KB

export const pogBundleSchema = z.object({
    schema: z.literal('pog.v1'),
    content_hash: z.string().regex(CONTENT_HASH_REGEX, 'Must match sha256:{64hex}'),
    agent_wallet: z.string().regex(ETH_ADDRESS_REGEX, 'Must be valid EVM address'),
    model_id: z.string().min(1).max(128),
    runtime_id: z.string().min(1).max(128),
    generation_process: generationProcessSchema,
    timestamp: z.string().datetime({ message: 'Must be ISO-8601 with timezone' }),
    nonce: z.string().min(16, 'Nonce must be at least 16 characters').max(128, 'Nonce must be at most 128 characters'),
    signature: z.string().startsWith('0x').length(132, 'Must be exactly 132 chars (0x + 130 hex)'),
}).refine(
    (data) => JSON.stringify(data).length <= POG_BUNDLE_MAX_SIZE,
    { message: `pog_bundle exceeds maximum size of ${POG_BUNDLE_MAX_SIZE / 1024}KB` },
);

export type PogBundle = z.infer<typeof pogBundleSchema>;

/**
 * Provenance metadata schema (Issues #11, #14).
 *
 * Allows linking an RxM record with embedded provenance standards:
 * C2PA, IPTC, XMP, Schema.org, or custom.
 *
 * pki_timestamp: optional PKI timestamp from the provenance standard
 * for dual temporal attestation (blockchain + PKI). Issue #14.
 *
 * Reference: Docs/c2pa-interoperability.md, OP-14
 */
export const provenanceMetadataSchema = z.object({
    standard: z.enum(['c2pa', 'iptc', 'xmp', 'schema_org', 'custom']),
    manifest_hash: z.string().regex(CONTENT_HASH_REGEX, 'Must match sha256:{64hex}'),
    claim_generator: z.string().max(256).optional(),
    issuer: z.string().max(256).optional(),
    assertions: z.array(z.string().max(128)).max(20).optional(),
    manifest_uri: z.string().url().max(1024).optional(),
    pki_timestamp: z.string().datetime({ message: 'Must be ISO-8601 with timezone' }).optional(),
});

export type ProvenanceMetadata = z.infer<typeof provenanceMetadataSchema>;

/**
 * Schema for the full POST /v1/records request body.
 */
export const createRecordSchema = z.object({
    pog_bundle: pogBundleSchema,
    content_type: z.string().min(1).max(127).optional(),
    visibility: z
        .enum(['proof_only', 'input_hash_only', 'content_optional'])
        .default('proof_only'),
    tags: z
        .array(z.string().min(1).max(64))
        .max(10)
        .default([]),
    external_ref: z.string().url().max(512).optional(),
    provenance_metadata: provenanceMetadataSchema.optional(),
    fee_amount: z.number().positive(),
    fee_currency: z.string().min(1).max(8),
    fee_tx_hash: z.string().regex(TX_HASH_REGEX, 'Must be valid transaction hash'),
});

export type CreateRecordInput = z.infer<typeof createRecordSchema>;

