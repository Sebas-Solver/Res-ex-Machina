// SPDX-License-Identifier: Apache-2.0

import { eq, and, sql, desc, asc, gte, lte, arrayContains } from 'drizzle-orm';
import { db } from '../db/index.js';
import { records } from '../db/schema.js';
import { createRecordSchema } from '../routes/schemas/index.js';
import type { ListRecordsQuery } from '../routes/schemas/listRecordsSchema.js';
import { generateRecordId } from '../utils/uuid.js';
import { computeReceiptHash } from './receipt.js';
import { enqueueAnchorJob } from './queue.js';
import {
    invalidPayload,
    invalidPogSchema,
    duplicateContentHash,
    duplicateNonce,
    feeTxReused,
} from '../utils/errors.js';
import { logger } from '../utils/logger.js';

// -------------------------------------------------------------------
// Tipos
// -------------------------------------------------------------------

/** Resultado de createRecord — lo que devuelve el POST /v1/records */
export interface CreateRecordResult {
    record_id: string;
    state: 'pending_anchor';
    receipt_hash: string;
    created_at: string; // ISO 8601
}

// -------------------------------------------------------------------
// 1. Validar y parsear el body del request
// -------------------------------------------------------------------

/**
 * Valida el body con Zod y diferencia errores de pog_bundle vs otros campos.
 * @throws ApiError 400 (invalid_payload | invalid_pog_schema)
 */
export function validateAndParseInput(body: unknown) {
    const parsed = createRecordSchema.safeParse(body);
    if (!parsed.success) {
        const firstError = parsed.error.issues[0];
        const path = firstError?.path?.join('.') ?? 'unknown';

        if (path.startsWith('pog_bundle')) {
            throw invalidPogSchema({
                field: path,
                issue: firstError?.message,
            });
        }

        throw invalidPayload({
            field: path,
            issue: firstError?.message,
        });
    }

    return parsed.data;
}

// -------------------------------------------------------------------
// 2. Checks de duplicados (DB)
// -------------------------------------------------------------------

/**
 * Verifica que no existan duplicados de content_hash, wallet+nonce, ni fee_tx_hash.
 * @throws ApiError 409 (duplicate_content_hash | duplicate_nonce | fee_tx_reused)
 */
export async function checkDuplicates(
    contentHash: string,
    agentWallet: string,
    nonce: string,
    feeTxHash: string,
) {
    // Parallelize the 3 checks — they are independent of each other.
    // Race conditions protegidas por UNIQUE constraints en DB.
    const [existingByHash, existingByNonce, existingByFee] = await Promise.all([
        db.select({ recordId: records.recordId })
            .from(records)
            .where(eq(records.contentHash, contentHash))
            .limit(1),
        db.select({ recordId: records.recordId })
            .from(records)
            .where(
                and(
                    eq(records.agentWallet, agentWallet),
                    eq(records.nonce, nonce),
                ),
            )
            .limit(1),
        db.select({ recordId: records.recordId })
            .from(records)
            .where(eq(records.feeTxHash, feeTxHash))
            .limit(1),
    ]);

    if (existingByHash.length > 0) throw duplicateContentHash();
    if (existingByNonce.length > 0) throw duplicateNonce();
    if (existingByFee.length > 0) throw feeTxReused();
}

// -------------------------------------------------------------------
// 3. Crear record (INSERT + enqueue anchor)
// -------------------------------------------------------------------

/**
 * Inserta el record en DB y encola el job de anchoring.
 * Si hay conflicto UNIQUE (race condition), devuelve 409 apropiado.
 * @throws ApiError 409 en caso de constraint violation
 */
export async function createRecord(
    input: ReturnType<typeof createRecordSchema.parse>,
    feeData?: { feeBlock: number; feeConfirmedAt: Date },
): Promise<CreateRecordResult> {
    const { pog_bundle } = input;
    const recordId = generateRecordId();
    const createdAt = new Date();

    const receiptHash = computeReceiptHash(
        recordId,
        pog_bundle.content_hash,
        pog_bundle.agent_wallet,
        pog_bundle.nonce,
        createdAt,
    );

    // INSERT protegido por UNIQUE constraints
    try {
        await db.insert(records).values({
            recordId,
            contentHash: pog_bundle.content_hash,
            contentType: input.content_type ?? null,
            visibility: input.visibility,
            pogBundle: pog_bundle,
            nonce: pog_bundle.nonce,
            agentWallet: pog_bundle.agent_wallet,
            state: 'pending_anchor',
            createdAt,
            receiptHash,
            tags: input.tags,
            externalRef: input.external_ref ?? null,
            provenanceMetadata: input.provenance_metadata ?? null,
            feeAmount: input.fee_amount.toFixed(8),
            feeCurrency: input.fee_currency,
            feeTxHash: input.fee_tx_hash,
            feeBlock: feeData?.feeBlock ?? null,
            feeConfirmedAt: feeData?.feeConfirmedAt ?? null,
        });
    } catch (dbError: unknown) {
        const pgError = dbError as { code?: string; constraint_name?: string; detail?: string };
        if (pgError.code === '23505') {
            const detail = (pgError.detail ?? pgError.constraint_name ?? '').toLowerCase();
            if (detail.includes('content_hash')) throw duplicateContentHash();
            if (detail.includes('wallet_nonce') || detail.includes('uq_wallet_nonce')) throw duplicateNonce();
            if (detail.includes('fee_tx_hash')) throw feeTxReused();
            throw duplicateContentHash(); // Unknown UNIQUE → generic
        }
        throw dbError;
    }

    // Enqueue anchor job (Issue #22: if Redis is not available,
    // el record se guarda igualmente y el anchoring se reintenta
    // cuando el worker se reconecte)
    try {
        await enqueueAnchorJob(recordId, receiptHash, pog_bundle.agent_wallet);
    } catch (enqueueError) {
        // Do not throw — the record is already saved in DB with state=pending_anchor.
        // The worker will process the job when Redis comes back.
        logger.warn({ recordId, error: enqueueError instanceof Error ? enqueueError.message : String(enqueueError) },
            '[recordsService] Could not enqueue anchor (Redis down?)');
    }

    return {
        record_id: recordId,
        state: 'pending_anchor',
        receipt_hash: receiptHash,
        created_at: createdAt.toISOString(),
    };
}

// -------------------------------------------------------------------
// 4. List records with filters and pagination (Issue #21)
// -------------------------------------------------------------------

/**
 * Lista records filtrados por wallet (obligatorio) y criterios opcionales.
 * Devuelve los records paginados + total para la respuesta.
 */
export async function listRecords(params: ListRecordsQuery) {
    // --- Build dynamic conditions ---
    const conditions = [
        sql`lower(${records.agentWallet}) = ${params.agent_wallet.toLowerCase()}`,
    ];

    if (params.state) {
        conditions.push(eq(records.state, params.state));
    }

    if (params.content_type) {
        conditions.push(eq(records.contentType, params.content_type));
    }

    if (params.tag) {
        conditions.push(arrayContains(records.tags, [params.tag]));
    }

    if (params.from) {
        conditions.push(gte(records.createdAt, new Date(params.from)));
    }

    if (params.to) {
        conditions.push(lte(records.createdAt, new Date(params.to)));
    }

    const whereClause = and(...conditions);

    // --- Contar total ---
    const countResult = await db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(records)
        .where(whereClause);

    const total = countResult[0]?.count ?? 0;

    // --- Obtener records paginados ---
    const orderFn = params.sort === 'created_at_asc'
        ? asc(records.createdAt)
        : desc(records.createdAt);

    const result = await db
        .select()
        .from(records)
        .where(whereClause)
        .orderBy(orderFn)
        .limit(params.limit)
        .offset(params.offset);

    return { records: result, total };
}

