import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { records } from '../db/schema.js';
import { env } from '../config/env.js';
import { verifyPoGSignature } from '../services/signature.js';
import { verifyFee } from '../services/fee.js';
import {
    validateAndParseInput,
    checkDuplicates,
    createRecord,
} from '../services/recordsService.js';
import {
    invalidContentHash,
    invalidRecordId,
    recordNotFound,
} from '../utils/errors.js';

/**
 * EIP-712 Domain exportado en receipts para verificación offline.
 * Debe coincidir con signature.ts.
 */
const EXPORTED_EIP712_DOMAIN = {
    name: 'ResExMachina',
    version: '1',
    chain_id: 0,
    verifying_contract: '0x0000000000000000000000000000000000000000',
} as const;

/**
 * Rutas del recurso /records.
 *
 * POST /   — Crear un nuevo record con PoG v1
 * GET /:id — Obtener record por ID (Issue #5)
 * GET /verify?content_hash= — Verificar existencia (Issue #5)
 * GET /:id/export — Exportar receipt (Issue #5)
 */
export default async function recordRoutes(fastify: FastifyInstance) {
    /**
     * POST /v1/records
     *
     * Flujo: validate → verify signature → check duplicates → verify fee → create record
     * Lógica de negocio en recordsService.ts (Q-1 refactor).
     */
    fastify.post('/', {
        config: {
            rateLimit: {
                max: 10,
                timeWindow: '1 minute',
                keyGenerator: (request: { ip: string; body?: unknown }) => {
                    const body = request.body as { pog_bundle?: { agent_wallet?: string } } | undefined;
                    const wallet = body?.pog_bundle?.agent_wallet;
                    return wallet ? `wallet:${wallet.toLowerCase()}` : request.ip;
                },
            },
        },
    }, async (request, reply) => {
        // 1. Validar body (Zod)
        const input = validateAndParseInput(request.body);
        const { pog_bundle } = input;

        // 2. Verificar firma EIP-712
        await verifyPoGSignature(pog_bundle);

        // 3. Checks de duplicados (content_hash, nonce, fee_tx_hash) en paralelo
        //    + verificar fee on-chain — independientes entre sí
        await Promise.all([
            checkDuplicates(
                pog_bundle.content_hash,
                pog_bundle.agent_wallet,
                pog_bundle.nonce,
                input.fee_tx_hash,
            ),
            verifyFee(input.fee_tx_hash),
        ]);

        // 4. Crear record (INSERT DB + enqueue anchor)
        const result = await createRecord(input);

        return reply.status(201).send(result);
    });

    // --- Endpoints de consulta (Issue #5) ---

    /**
     * GET /v1/records/:id
     * Devuelve un record completo por su UUID.
     */
    fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
        const { id } = request.params;

        // Validar formato UUID
        if (!isValidUUID(id)) {
            throw invalidRecordId();
        }

        const result = await db
            .select()
            .from(records)
            .where(eq(records.recordId, id))
            .limit(1);

        if (result.length === 0) {
            throw recordNotFound();
        }

        const record = result[0];
        return reply.send(formatRecordResponse(record));
    });

    /**
     * GET /v1/records/verify?content_hash=sha256:...
     * Verifica si existe un record con el content_hash dado.
     */
    fastify.get<{ Querystring: { content_hash?: string } }>('/verify', async (request, reply) => {
        const { content_hash } = request.query;

        if (!content_hash || !/^sha256:[a-f0-9]{64}$/.test(content_hash)) {
            throw invalidContentHash();
        }

        const result = await db
            .select()
            .from(records)
            .where(eq(records.contentHash, content_hash))
            .limit(1);

        if (result.length === 0) {
            throw recordNotFound();
        }

        const record = result[0];
        return reply.send({
            exists: true,
            record_id: record.recordId,
            state: record.state,
            created_at: record.createdAt.toISOString(),
            receipt_hash: record.receiptHash,
        });
    });

    /**
     * GET /v1/records/:id/export
     * Exporta el receipt completo verificable (PoG + anchoring + metadata).
     */
    fastify.get<{ Params: { id: string } }>('/:id/export', async (request, reply) => {
        const { id } = request.params;

        if (!isValidUUID(id)) {
            throw invalidRecordId();
        }

        const result = await db
            .select()
            .from(records)
            .where(eq(records.recordId, id))
            .limit(1);

        if (result.length === 0) {
            throw recordNotFound();
        }

        const record = result[0];

        // Receipt exportable — contiene toda la info para verificación offline
        return reply.send({
            schema: 'rex.receipt.v1',
            spec_version: '1.2',
            record_id: record.recordId,
            content_hash: record.contentHash,
            content_type: record.contentType,
            visibility: record.visibility,
            pog_bundle: {
                ...record.pogBundle as object,
                eip712_domain: EXPORTED_EIP712_DOMAIN,
            },
            receipt_hash: record.receiptHash,
            verification: {
                receipt_hash_algo: 'sha256',
                receipt_canonicalization: 'pipe-separated',
                receipt_fields: 'record_id|content_hash|agent_wallet_lowercase|nonce|created_at_iso8601',
                eip712_primary_type: 'PoGBundle',
            },
            created_at: record.createdAt.toISOString(),
            state: record.state,
            fee: {
                amount: record.feeAmount,
                currency: record.feeCurrency,
                tx_hash: record.feeTxHash,
                chain_id: env.L2_CHAIN_ID,
                to: env.FEE_RECEIVER_ADDRESS,
            },
            anchor: record.anchorTxHash
                ? {
                    tx_hash: record.anchorTxHash,
                    block: record.anchorBlock,
                    chain_id: record.anchorChainId,
                    anchored_at: record.anchoredAt?.toISOString() ?? null,
                    anchored_hash: record.receiptHash,
                    anchor_method: 'calldata',
                }
                : null,
        });
    });
}

// --- Helpers ---

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(value: string): boolean {
    return UUID_REGEX.test(value);
}

/**
 * Formatea un record de la DB para la respuesta API.
 * Convierte snake_case de la DB a la respuesta JSON.
 */
function formatRecordResponse(record: typeof records.$inferSelect) {
    return {
        record_id: record.recordId,
        content_hash: record.contentHash,
        content_type: record.contentType,
        visibility: record.visibility,
        pog_bundle: record.pogBundle,
        nonce: record.nonce,
        agent_wallet: record.agentWallet,
        state: record.state,
        created_at: record.createdAt.toISOString(),
        receipt_hash: record.receiptHash,
        tags: record.tags,
        external_ref: record.externalRef,
        fee: {
            amount: record.feeAmount,
            currency: record.feeCurrency,
            tx_hash: record.feeTxHash,
            chain_id: env.L2_CHAIN_ID,
            to: env.FEE_RECEIVER_ADDRESS,
        },
        anchor: record.anchorTxHash
            ? {
                tx_hash: record.anchorTxHash,
                block: record.anchorBlock,
                chain_id: record.anchorChainId,
                anchored_at: record.anchoredAt?.toISOString() ?? null,
                anchored_hash: record.receiptHash,
                anchor_method: 'calldata',
            }
            : null,
    };
}
