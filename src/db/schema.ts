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

/**
 * Tabla principal: records
 *
 * Almacena cada hecho de generación registrado por un agente de IA.
 * Referencia: PRD v1.1 sección G (Modelo de datos)
 *
 * Invariantes relacionados:
 * - INV-001: Records permanentes (no DELETE)
 * - INV-002: No UPDATE de campos post-creación
 * - INV-014: Nonce uniqueness por wallet
 * - INV-012: No hay registro sin fee pagado
 */
export const records = pgTable(
    'records',
    {
        // --- Identificación ---
        /** UUID v7, generado en la aplicación (NO gen_random_uuid()) */
        recordId: uuid('record_id').primaryKey(),

        /** SHA-256 del output generado. Formato: sha256:{64hex} */
        contentHash: varchar('content_hash', { length: 128 }).notNull().unique(),

        /** MIME type del output (opcional) */
        contentType: varchar('content_type', { length: 64 }),

        /** Modo de visibilidad del registro */
        visibility: varchar('visibility', { length: 32 }).notNull().default('proof_only'),

        // --- Proof of Generation ---
        /** PoG v1 bundle completo (schema, firma, metadata de generación) */
        pogBundle: jsonb('pog_bundle').notNull(),

        /** Nonce único por wallet — previene replay attacks */
        nonce: varchar('nonce', { length: 64 }).notNull(),

        /** Dirección de la wallet del agente que firma */
        agentWallet: varchar('agent_wallet', { length: 42 }).notNull(),

        // --- Estado ---
        /** Estado del anchoring: pending_anchor → anchored | anchor_failed */
        state: varchar('state', { length: 32 }).notNull().default('pending_anchor'),

        /** Timestamp de creación del registro */
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

        /** Hash del receipt completo */
        receiptHash: varchar('receipt_hash', { length: 128 }).notNull(),

        // --- Metadata opcional ---
        /** Etiquetas libres (max 10) */
        tags: text('tags').array().default(sql`'{}'::text[]`),

        /** URL o pointer a contenido externo (IPFS, S3, etc.) */
        externalRef: text('external_ref'),

        /** Metadatos de procedencia (C2PA, IPTC, XMP, Schema.org) — Issue #11 */
        provenanceMetadata: jsonb('provenance_metadata'),

        // --- Fee ---
        /** Monto del fee pagado */
        feeAmount: numeric('fee_amount', { precision: 18, scale: 8 }).notNull(),

        /** Moneda del fee (ej: "MATIC", "ETH") */
        feeCurrency: varchar('fee_currency', { length: 8 }).notNull(),

        /** Hash de la transacción de pago del fee — 1:1 con record, no reutilizable */
        feeTxHash: varchar('fee_tx_hash', { length: 66 }).notNull().unique(),

        /** Número de bloque donde se confirmó el fee (Issue #23) */
        feeBlock: bigint('fee_block', { mode: 'number' }),

        /** Timestamp de confirmación del fee on-chain (Issue #23) */
        feeConfirmedAt: timestamp('fee_confirmed_at', { withTimezone: true }),

        // --- Anchoring ---
        /** Hash de la transacción de anchoring on-chain */
        anchorTxHash: varchar('anchor_tx_hash', { length: 66 }),

        /** Número de bloque del anchoring */
        anchorBlock: bigint('anchor_block', { mode: 'number' }),

        /** Chain ID de la blockchain de anchoring */
        anchorChainId: integer('anchor_chain_id'),

        /** Motivo del fallo de anchoring (si state == anchor_failed) */
        anchorErrorReason: text('anchor_error_reason'),

        /** Número de reintentos de anchoring */
        anchorRetries: integer('anchor_retries').notNull().default(0),

        /** Timestamp del anchoring exitoso */
        anchoredAt: timestamp('anchored_at', { withTimezone: true }),
    },
    (table) => [
        // --- UNIQUE constraints ---
        /** Anti-replay: un nonce no puede reutilizarse por la misma wallet */
        unique('uq_wallet_nonce').on(table.agentWallet, table.nonce),

        // --- Índices ---
        index('idx_records_agent').on(table.agentWallet),
        index('idx_records_state').on(table.state),
        index('idx_records_created').on(table.createdAt),
        index('idx_records_fee_tx').on(table.feeTxHash),

        // --- CHECK constraints ---
        /** content_hash debe seguir el formato sha256:{64 hex chars} */
        check('chk_content_hash', sql`${table.contentHash} ~ '^sha256:[a-f0-9]{64}$'`),

        /** state solo puede ser uno de estos 3 valores */
        check(
            'chk_state',
            sql`${table.state} IN ('pending_anchor', 'anchored', 'anchor_failed')`,
        ),

        /** visibility solo puede ser uno de estos 3 valores */
        check(
            'chk_visibility',
            sql`${table.visibility} IN ('proof_only', 'input_hash_only', 'content_optional')`,
        ),
    ],
);

/** Tipo inferido para un record completo (SELECT) */
export type DbRecord = typeof records.$inferSelect;

/** Tipo inferido para insertar un nuevo record (INSERT) */
export type NewRecord = typeof records.$inferInsert;

// =============================================
// Tabla: webhooks (Issue #13)
// =============================================

/**
 * Tabla de webhooks para notificaciones push de cambios de estado.
 *
 * Seguridad:
 * - URL solo HTTPS (validado en app layer)
 * - Secret generado por servidor (32 bytes hex)
 * - Máximo 5 webhooks activos por wallet (app layer)
 */
export const webhooks = pgTable(
    'webhooks',
    {
        /** UUID v7, generado en la aplicación */
        webhookId: uuid('webhook_id').primaryKey(),

        /** Wallet del agente propietario */
        agentWallet: varchar('agent_wallet', { length: 42 }).notNull(),

        /** URL HTTPS donde enviar notificaciones */
        url: text('url').notNull(),

        /** Secreto HMAC-SHA256 generado por servidor (64 hex chars) */
        secret: varchar('secret', { length: 128 }).notNull(),

        /** Eventos suscritos */
        events: text('events').array().notNull().default(sql`ARRAY['state_changed']::text[]`),

        /** Si el webhook está activo */
        active: boolean('active').notNull().default(true),

        /** Timestamp de creación */
        createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        index('idx_webhooks_wallet').on(table.agentWallet),
        index('idx_webhooks_active').on(table.active),
    ],
);

/** Tipo inferido para un webhook completo (SELECT) */
export type Webhook = typeof webhooks.$inferSelect;

/** Tipo inferido para insertar un nuevo webhook (INSERT) */
export type NewWebhook = typeof webhooks.$inferInsert;

