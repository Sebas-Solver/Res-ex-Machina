import type { FastifyInstance } from 'fastify';
import { eq, desc, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { records } from '../db/schema.js';
import { env } from '../config/env.js';
import {
    validateAndParseInput,
    checkDuplicates,
    createRecord,
} from '../services/recordsService.js';
import { verifyPoGSignature } from '../services/signature.js';
import { verifyFee } from '../services/fee.js';
import { waitForAnchor } from '../services/waitForAnchor.js';
import {
    invalidRecordId,
    recordNotFound,
    invalidContentHash,
} from '../utils/errors.js';
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
    // --- Endpoint autenticado (Issue #26) ---

    /**
     * GET /v1/records/mine
     *
     * Lista los records del agente autenticado.
     * Requiere firma EIP-191 del mensaje "RexAuth:{timestamp}" en headers.
     * Soporta paginación con ?limit=20&offset=0
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

        // Obtener records paginados, más recientes primero
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

    // --- Endpoints de consulta públicos (Issue #5) ---

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
     * Soporta ?mode=compact para reducir tamaño (menos tokens para LLMs).
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

        // Receipt exportable — contiene toda la info para verificación offline
        return reply.send(formatFullExport(record));
    });

    // No DELETE route — INV-001: Records son permanentes.
    // Fastify devuelve 404 automáticamente si la ruta no existe.
}

// --- Helpers ---

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(value: string): boolean {
    return UUID_REGEX.test(value);
}


