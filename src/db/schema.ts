// SPDX-License-Identifier: Apache-2.0

import {
    pgTable,
    uuid,
    varchar,
    text,
    jsonb,
    timestamp,
    numeric,
    integer,
    bigint,
    boolean,
    index,
    unique,
    check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm';

/**
 * Main table: records
 *
 * Stores each generation fact registered by an AI agent.
 * Reference: PRD v1.1 section G (Data model)
 *
 * Related invariants:
 * - INV-001: Records are permanent (no DELETE)
 * - INV-002: No UPDATE of post-creation fields
 * - INV-014: Nonce uniqueness per wallet
 * - INV-012: No record without a paid fee
 */
export const records = pgTable(
    'records',
    {
        // --- Identification ---
        /** UUID v7, generated in the application (NOT gen_random_uuid()) */
        recordId: uuid('record_id').primaryKey(),

        /** SHA-256 of the generated output. Format: sha256:{64hex} */
        contentHash: varchar('content_hash', { length: 128 }).notNull().unique(),

        /** MIME type of the output (optional) */
        contentType: varchar('content_type', { length: 64 }),

        /** Record visibility mode */
        visibility: varchar('visibility', { length: 32 }).notNull().default('proof_only'),

        // --- Proof of Generation ---
        /** Complete PoG v1 bundle (schema, signature, generation metadata) */
        pogBundle: jsonb('pog_bundle').notNull(),

        /** Unique nonce per wallet — prevents replay attacks */
        nonce: varchar('nonce', { length: 64 }).notNull(),

        /** Address of the signing agent wallet */
        agentWallet: varchar('agent_wallet', { length: 42 }).notNull(),

        // --- State ---
        /** Anchoring state: pending_anchor → anchored | anchor_failed */
        state: varchar('state', { length: 32 }).notNull().default('pending_anchor'),

        /** Record creation timestamp */
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

        /** Hash of the complete receipt */
        receiptHash: varchar('receipt_hash', { length: 128 }).notNull(),

        // --- Optional metadata ---
        /** Free-form tags (max 10) */
        tags: text('tags').array().default(sql`'{}'::text[]`),

        /** URL or pointer to external content (IPFS, S3, etc.) */
        externalRef: text('external_ref'),

        /** Provenance metadata (C2PA, IPTC, XMP, Schema.org) — Issue #11 */
        provenanceMetadata: jsonb('provenance_metadata'),

        /** Payment Attempt ID this record belongs to */
        paymentAttemptId: uuid('payment_attempt_id'),

        // --- Fee ---
        /** Amount of the paid fee */
        feeAmount: numeric('fee_amount', { precision: 18, scale: 8 }).notNull(),

        /** Fee currency (e.g.: "MATIC", "ETH") */
        feeCurrency: varchar('fee_currency', { length: 8 }).notNull(),

        /** Fee payment transaction hash — 1:1 with record, non-reusable */
        feeTxHash: varchar('fee_tx_hash', { length: 66 }).unique(),

        /** Block number where the fee was confirmed (Issue #23) */
        feeBlock: bigint('fee_block', { mode: 'number' }),

        /** Fee on-chain confirmation timestamp (Issue #23) */
        feeConfirmedAt: timestamp('fee_confirmed_at', { withTimezone: true }),

        // --- Anchoring ---
        /** On-chain anchoring transaction hash */
        anchorTxHash: varchar('anchor_tx_hash', { length: 66 }),

        /** Anchoring block number */
        anchorBlock: bigint('anchor_block', { mode: 'number' }),

        /** Chain ID of the anchoring blockchain */
        anchorChainId: integer('anchor_chain_id'),

        /** Reason for anchoring failure (if state == anchor_failed) */
        anchorErrorReason: text('anchor_error_reason'),

        /** Number of anchoring retries */
        anchorRetries: integer('anchor_retries').notNull().default(0),

        /** Timestamp of successful anchoring */
        anchoredAt: timestamp('anchored_at', { withTimezone: true }),
    },
    (table) => [
        // --- UNIQUE constraints ---
        /** Anti-replay: a nonce cannot be reused by the same wallet */
        unique('uq_wallet_nonce').on(table.agentWallet, table.nonce),

        // --- Indexes ---
        /** Functional index for case-insensitive wallet lookups (listRecords uses lower()) */
        index('idx_records_agent_lower').using('btree', sql`lower(${table.agentWallet})`),
        index('idx_records_state').on(table.state),
        index('idx_records_created').on(table.createdAt),
        index('idx_records_fee_tx').on(table.feeTxHash),
        index('idx_records_payment_attempt').on(table.paymentAttemptId),

        // --- CHECK constraints ---
        /** content_hash must follow the format sha256:{64 hex chars} */
        check('chk_content_hash', sql`${table.contentHash} ~ '^sha256:[a-f0-9]{64}$'`),

        /** state can only be one of these 3 values */
        check(
            'chk_state',
            sql`${table.state} IN ('pending_anchor', 'anchored', 'anchor_failed')`,
        ),

        /** visibility can only be one of these 3 values */
        check(
            'chk_visibility',
            sql`${table.visibility} IN ('proof_only', 'input_hash_only', 'content_optional')`,
        ),
    ],
);

/** Inferred type for a complete record (SELECT) */
export type DbRecord = typeof records.$inferSelect;

/** Inferred type for inserting a new record (INSERT) */
export type NewRecord = typeof records.$inferInsert;

export const recordsRelations = relations(records, ({ one }) => ({
    paymentAttempt: one(paymentAttempts, {
        fields: [records.paymentAttemptId],
        references: [paymentAttempts.id],
    }),
}));

// =============================================
// Tabla: webhooks (Issue #13)
// =============================================

/**
 * Webhooks table for push notifications on state changes.
 *
 * Security:
 * - HTTPS-only URLs (validated in app layer)
 * - Server-generated secret (32 bytes hex)
 * - Maximum 5 active webhooks per wallet (app layer)
 */
export const webhooks = pgTable(
    'webhooks',
    {
        /** UUID v7, generated in the application */
        webhookId: uuid('webhook_id').primaryKey(),

        /** Owner agent wallet address */
        agentWallet: varchar('agent_wallet', { length: 42 }).notNull(),

        /** HTTPS URL to send notifications to */
        url: text('url').notNull(),

        /** P1-1: AES-256-GCM Encrypted Secret (legacy plaintext secret column dropped) */
        secretCiphertext: text('secret_ciphertext'),
        secretIv: varchar('secret_iv', { length: 24 }),
        secretAuthTag: varchar('secret_auth_tag', { length: 32 }),
        secretKeyVersion: integer('secret_key_version'),

        /** Subscribed events */
        events: text('events').array().notNull().default(sql`ARRAY['state_changed']::text[]`),

        /** Whether the webhook is active */
        active: boolean('active').notNull().default(true),

        /** Creation timestamp */
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        index('idx_webhooks_wallet').on(table.agentWallet),
        index('idx_webhooks_active').on(table.active),
    ],
);

/** Inferred type for a complete webhook (SELECT) */
export type Webhook = typeof webhooks.$inferSelect;

/** Inferred type for inserting a new webhook (INSERT) */
export type NewWebhook = typeof webhooks.$inferInsert;

// =============================================
// Tabla: payment_attempts
// =============================================

/**
 * Payment Attempts table.
 * 
 * Separates the payment lifecycle from the final record creation,
 * ensuring INV-012: No record without accepted payment evidence.
 */
export const paymentAttempts = pgTable(
    'payment_attempts',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        idempotencyKey: varchar('idempotency_key', { length: 255 }).unique(), // Opcional, legacy
        paymentIdentifier: varchar('payment_identifier', { length: 255 }), // Obligatorio para x402
        method: varchar('method', { length: 50 }).notNull(), // 'legacy_eth', 'x402_usdc'
        status: varchar('status', { length: 50 }).notNull(), // 'pending', 'settled', 'failed'
        
        // Vínculo con el futuro/existente record
        contentHash: varchar('content_hash', { length: 128 }).notNull(),
        recordId: uuid('record_id'), // Referencia opcional antes de crear el record
        
        // Evidencia
        amountAtomic: varchar('amount_atomic', { length: 255 }),
        decimals: varchar('decimals', { length: 10 }),
        currency: varchar('currency', { length: 50 }),
        txHash: varchar('tx_hash', { length: 255 }),
        receipt: jsonb('receipt'),
        
        error: text('error'),
        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => [
        // Composite unique index para idempotencia estricta en x402
        unique('idx_pa_payment_identifier')
            .on(table.paymentIdentifier)
            .nullsNotDistinct() // Dependiendo de versión PG o Drizzle, a veces se usa where
    ]
);

export const paymentAttemptsRelations = relations(paymentAttempts, ({ one }) => ({
    record: one(records, {
        fields: [paymentAttempts.recordId],
        references: [records.recordId],
    }),
}));

export type PaymentAttempt = typeof paymentAttempts.$inferSelect;
export type NewPaymentAttempt = typeof paymentAttempts.$inferInsert;


