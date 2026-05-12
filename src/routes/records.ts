// SPDX-License-Identifier: Apache-2.0

import type { FastifyInstance } from 'fastify';
import { eq, desc, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { records } from '../db/schema.js';
import { env } from '../config/env.js';
import {
    validateAndParseInput,
    checkDuplicates,
    createRecord,
    listRecords,
} from '../services/recordsService.js';
import { verifyPoGSignature } from '../services/signature.js';
import { verifyFee } from '../services/fee.js';
import { waitForAnchor } from '../services/waitForAnchor.js';
import { batchRequestSchema } from './schemas/batchRecordSchema.js';
import {
    invalidRecordId,
    recordNotFound,
    invalidContentHash,
    missingAgentWallet,
    invalidQueryParam,
    batchInvalidPayload,
} from '../utils/errors.js';
import { ApiError } from '../utils/errors.js';
import { listRecordsQuerySchema } from './schemas/listRecordsSchema.js';
import { getStateInfo } from '../utils/stateInfo.js';
import { getExplorerTxUrl, getNetworkName } from '../utils/explorer.js';
import {
    formatRecordResponse,
    formatCompactExport,
    formatFullExport,
} from '../utils/formatters.js';
import { walletAuth } from '../middleware/walletAuth.js';


/**
 * Rutas del recurso /records.
 *
 * POST /     — Crear un nuevo record con PoG v1 (soporta ?wait_for_anchor=true)
 * GET /mine  — Listar records propios, autenticado por firma de wallet (Issue #26)
 * GET /:id   — Obtener record por ID (Issue #5)
 * GET /verify?content_hash= — Verificar existencia (Issue #5)
 * GET /:id/export — Exportar receipt (Issue #5, soporta ?mode=compact)
 */
export default async function recordRoutes(fastify: FastifyInstance) {
    // --- Public listing endpoint (Issue #21) ---

    /**
     * GET /v1/records?agent_wallet=0x...
     *
     * Lista records filtrados por wallet (obligatorio) y criterios opcionales.
     * Soporta filtros: state, content_type, tag, from, to, sort.
     * Pagination: limit (1-100, default 20), offset (default 0).
     */
    fastify.get<{
        Querystring: Record<string, string | undefined>;
    }>('/', async (request, reply) => {
        // Validar query params con Zod
        const parsed = listRecordsQuerySchema.safeParse(request.query);

        if (!parsed.success) {
            const firstError = parsed.error.issues[0];
            const path = firstError?.path?.join('.') ?? 'unknown';

            // Specific error if agent_wallet is missing
            if (path === 'agent_wallet') {
                throw missingAgentWallet();
            }

            throw invalidQueryParam({
                field: path,
                issue: firstError?.message,
            });
        }

        const params = parsed.data;

        // Consultar DB
        const result = await listRecords(params);

        return reply.send({
            records: result.records.map(formatRecordResponse),
            pagination: {
                total: result.total,
                limit: params.limit,
                offset: params.offset,
                has_more: params.offset + params.limit < result.total,
            },
        });
    });

    /**
     * POST /v1/records
     *
     * Flujo: validate → verify signature → check duplicates → verify fee → create record
     * Opcionalmente espera al anchoring con ?wait_for_anchor=true
     */
    fastify.post<{
        Querystring: { wait_for_anchor?: string };
    }>('/', {
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
        //    + verify fee on-chain — independent of each other
        const [, feeVerification] = await Promise.all([
            checkDuplicates(
                pog_bundle.content_hash,
                pog_bundle.agent_wallet,
                pog_bundle.nonce,
                input.fee_tx_hash,
            ),
            verifyFee(input.fee_tx_hash),
        ]);

        // 4. Crear record (INSERT DB + enqueue anchor)
        //    Issue #23: pasar datos enriquecidos de fee (block + confirmed_at)
        const result = await createRecord(input, {
            feeBlock: Number(feeVerification.blockNumber),
            feeConfirmedAt: feeVerification.confirmedAt,
        });

        // 5. Si wait_for_anchor=true, esperar al anchoring (max 25s)
        const shouldWait = request.query.wait_for_anchor === 'true';

        if (shouldWait) {
            const waitResult = await waitForAnchor(result.record_id);

            if (waitResult.state !== 'pending_anchor') {
                // Anchoring completado — devolver estado final
                return reply.status(201).send({
                    ...result,
                    state: waitResult.state,
                    state_info: getStateInfo(waitResult.state),
                    anchor: waitResult.anchorTxHash
                        ? {
                            tx_hash: waitResult.anchorTxHash,
                            block: waitResult.anchorBlock,
                            chain_id: waitResult.anchorChainId,
                            anchored_at: waitResult.anchoredAt?.toISOString() ?? null,
                            network_name: getNetworkName(waitResult.anchorChainId ?? env.L2_CHAIN_ID),
                            explorer_url: getExplorerTxUrl(
                                waitResult.anchorChainId ?? env.L2_CHAIN_ID,
                                waitResult.anchorTxHash,
                            ),
                        }
                        : null,
                });
            }

            // Timeout — devolver pending_anchor con Retry-After
            reply.header('Retry-After', '5');
        }

        return reply.status(201).send({
            ...result,
            state_info: getStateInfo(result.state),
        });
    });
    // --- Batch endpoint (Issue #12) ---

    /**
     * POST /v1/records/batch
     *
     * Registra hasta 100 records en una sola llamada.
     * Cada record se procesa de forma independiente: si uno falla,
     * the rest continue. There is no global transaction.
     *
     * Body: { records: CreateRecordInput[] }
     * Respuesta: { results: [...], summary: { total, succeeded, failed } }
     */
    fastify.post('/batch', {
        bodyLimit: 256 * 1024, // 256KB — batches de hasta 100 records (Threat Model — D-04)
        config: {
            rateLimit: {
                max: 5,
                timeWindow: '1 minute',
                keyGenerator: (request: { ip: string; body?: unknown }) => {
                    // Intentar extraer wallet del primer record del batch
                    const body = request.body as { records?: Array<{ pog_bundle?: { agent_wallet?: string } }> } | undefined;
                    const wallet = body?.records?.[0]?.pog_bundle?.agent_wallet;
                    return wallet ? `batch:${wallet.toLowerCase()}` : `batch:${request.ip}`;
                },
            },
        },
    }, async (request, reply) => {
        // 1. Validar estructura del batch con Zod
        const parsed = batchRequestSchema.safeParse(request.body);
        if (!parsed.success) {
            const firstError = parsed.error.issues[0];
            throw batchInvalidPayload({
                field: firstError?.path?.join('.') ?? 'records',
                issue: firstError?.message,
            });
        }

        const { records: batchItems } = parsed.data;

        // 2. Procesar cada record en paralelo con Promise.allSettled
        //    Cada record es independiente (distinto content_hash, nonce, fee_tx_hash).
        //    Promise.allSettled nunca rechaza: cada resultado es fulfilled o rejected.
        type BatchResultSuccess = { index: number; record_id: string; state: string; receipt_hash: string; created_at: string };
        type BatchResultError = { index: number; error: { code: string; message: string; details?: Record<string, unknown> } };
        type BatchResult = BatchResultSuccess | BatchResultError;

        const settlements = await Promise.allSettled(
            batchItems.map(async (item, i) => {
                const { pog_bundle } = item;

                // Verificar firma EIP-712
                await verifyPoGSignature(pog_bundle);

                // Checks de duplicados + fee en paralelo
                const [, feeVerification] = await Promise.all([
                    checkDuplicates(
                        pog_bundle.content_hash,
                        pog_bundle.agent_wallet,
                        pog_bundle.nonce,
                        item.fee_tx_hash,
                    ),
                    verifyFee(item.fee_tx_hash),
                ]);

                // Crear record
                const result = await createRecord(item, {
                    feeBlock: Number(feeVerification.blockNumber),
                    feeConfirmedAt: feeVerification.confirmedAt,
                });

                return { index: i, result };
            }),
        );

        // 3. Recopilar resultados manteniendo el orden original
        const results: BatchResult[] = [];
        let succeeded = 0;
        let failed = 0;

        for (let i = 0; i < settlements.length; i++) {
            const settlement = settlements[i];
            if (settlement.status === 'fulfilled') {
                const { result } = settlement.value;
                results.push({
                    index: i,
                    record_id: result.record_id,
                    state: result.state,
                    receipt_hash: result.receipt_hash,
                    created_at: result.created_at,
                });
                succeeded++;
            } else {
                failed++;
                const err = settlement.reason;
                if (err instanceof ApiError) {
                    results.push({
                        index: i,
                        error: {
                            code: err.code,
                            message: err.message,
                            ...(err.details && { details: err.details }),
                        },
                    });
                } else {
                    results.push({
                        index: i,
                        error: {
                            code: 'internal_error',
                            message: 'An unexpected error occurred processing this record',
                        },
                    });
                }
            }
        }

        // 3. Determinar status code — 207 si hay mezcla, 201 si todo ok, 400 si todo falla
        const statusCode = failed === 0 ? 201 : succeeded === 0 ? 400 : 207;

        return reply.status(statusCode).send({
            results,
            summary: {
                total: batchItems.length,
                succeeded,
                failed,
            },
        });
    });

    // --- Endpoint autenticado (Issue #26) ---

    /**
     * GET /v1/records/mine
     *
     * Lista los records del agente autenticado.
     * Requiere firma EIP-191 del mensaje "RexAuth:{timestamp}" en headers.
     * Supports pagination with ?limit=20&offset=0
     *
     * IMPORTANTE: Esta ruta DEBE registrarse ANTES de /:id
     * para que Fastify no interprete "mine" como un UUID.
     */
    fastify.get<{
        Querystring: { limit?: string; offset?: string };
    }>('/mine', {
        preHandler: walletAuth,
    }, async (request, reply) => {
        const wallet = request.authenticatedWallet!;
        const limit = Math.min(Math.max(parseInt(request.query.limit ?? '20', 10) || 20, 1), 100);
        const offset = Math.max(parseInt(request.query.offset ?? '0', 10) || 0, 0);

        // Contar total de records de esta wallet (case-insensitive)
        const walletFilter = sql`lower(${records.agentWallet}) = ${wallet}`;

        const countResult = await db
            .select({ count: records.recordId })
            .from(records)
            .where(walletFilter);

        const total = countResult.length;

        // Get paginated records, most recent first
        const result = await db
            .select()
            .from(records)
            .where(walletFilter)
            .orderBy(desc(records.createdAt))
            .limit(limit)
            .offset(offset);

        return reply.send({
            wallet,
            total,
            records: result.map(formatRecordResponse),
            pagination: {
                limit,
                offset,
                has_more: offset + limit < total,
            },
        });
    });

    // --- Public query endpoints (Issue #5) ---

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
            state_info: getStateInfo(record.state),
            created_at: record.createdAt.toISOString(),
            receipt_hash: record.receiptHash,
        });
    });

    /**
     * GET /v1/records/:id/export
     * Exporta el receipt completo verificable (PoG + anchoring + metadata).
     * Supports ?mode=compact to reduce size (fewer tokens for LLMs).
     */
    fastify.get<{
        Params: { id: string };
        Querystring: { mode?: string };
    }>('/:id/export', async (request, reply) => {
        const { id } = request.params;
        const mode = request.query.mode ?? 'full';

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

        if (mode === 'compact') {
            return reply.send(formatCompactExport(record));
        }

        // Exportable receipt — contains all info for offline verification
        return reply.send(formatFullExport(record));
    });

    // No DELETE route — INV-001: Records son permanentes.
    // Fastify returns 404 automatically if the route does not exist.
}

// --- Helpers ---

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(value: string): boolean {
    return UUID_REGEX.test(value);
}


