import type { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { records } from '../db/schema.js';
import { createRecordSchema } from './schemas/index.js';
import { verifyPoGSignature } from '../services/signature.js';
import { computeReceiptHash } from '../services/receipt.js';
import { verifyFee } from '../services/fee.js';
import { enqueueAnchorJob } from '../services/queue.js';
import { generateRecordId } from '../utils/uuid.js';
import {
    invalidPayload,
    invalidPogSchema,
    invalidContentHash,
    invalidRecordId,
    recordNotFound,
    duplicateContentHash,
    duplicateNonce,
    feeTxReused,
} from '../utils/errors.js';

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
     * Flujo completo:
     * 1. Validar body con Zod
     * 2. Verificar firma EIP-712
     * 3. Check idempotencia (content_hash duplicado) → 409
     * 4. Check nonce duplicado (wallet+nonce) → 409
     * 5. Verificar fee on-chain → 402
     * 6. Check fee_tx_hash no reusado → 409
     * 7. Generar UUID v7
     * 8. Calcular receipt_hash
     * 9. INSERT en DB
     * 10. Encolar anchor job
     * 11. Responder 201
     */
    fastify.post('/', {
        config: {
            rateLimit: {
                max: 10,
                timeWindow: '1 minute',
                keyGenerator: (request: { ip: string; body?: unknown }) => {
                    // Rate limit por wallet si disponible, si no por IP
                    const body = request.body as { pog_bundle?: { agent_wallet?: string } } | undefined;
                    const wallet = body?.pog_bundle?.agent_wallet;
                    return wallet ? `wallet:${wallet.toLowerCase()}` : request.ip;
                },
            },
        },
    }, async (request, reply) => {
        // 1. Validar body
        const parsed = createRecordSchema.safeParse(request.body);
        if (!parsed.success) {
            const firstError = parsed.error.issues[0];
            const path = firstError?.path?.join('.') ?? 'unknown';

            // Diferenciar errores del pog_bundle vs otros campos
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

        const input = parsed.data;
        const { pog_bundle } = input;

        // 2. Verificar firma EIP-712
        await verifyPoGSignature(pog_bundle);

        // 3-5. Paralelizar checks independientes:
        //   - content_hash duplicado (DB)
        //   - wallet+nonce duplicado (DB)
        //   - fee verified on-chain (RPC)
        // Son independientes entre sí → Promise.all ahorra ~4s de latencia.
        // Race conditions protegidas por UNIQUE constraints en DB (INSERT falla si hay conflicto).
        const [existingByHash, existingByNonce] = await Promise.all([
            // Check content_hash único
            db.select({ recordId: records.recordId })
                .from(records)
                .where(eq(records.contentHash, pog_bundle.content_hash))
                .limit(1),
            // Check nonce único por wallet
            db.select({ recordId: records.recordId })
                .from(records)
                .where(
                    and(
                        eq(records.agentWallet, pog_bundle.agent_wallet),
                        eq(records.nonce, pog_bundle.nonce),
                    ),
                )
                .limit(1),
            // Verificar fee on-chain (tx confirmada, monto, destinatario, reciente)
            verifyFee(input.fee_tx_hash),
        ]);

        if (existingByHash.length > 0) {
            throw duplicateContentHash();
        }

        if (existingByNonce.length > 0) {
            throw duplicateNonce();
        }

        // 6. Check fee_tx_hash no reusado (depende de que verifyFee haya pasado)
        const existingByFee = await db
            .select({ recordId: records.recordId })
            .from(records)
            .where(eq(records.feeTxHash, input.fee_tx_hash))
            .limit(1);

        if (existingByFee.length > 0) {
            throw feeTxReused();
        }

        // 7. Generar UUID v7
        const recordId = generateRecordId();
        const createdAt = new Date();

        // 8. Calcular receipt_hash
        const receiptHash = computeReceiptHash(
            recordId,
            pog_bundle.content_hash,
            pog_bundle.agent_wallet,
            pog_bundle.nonce,
            createdAt,
        );

        // 9. INSERT en DB
        // Protegido por UNIQUE constraints: si una race condition pasó los checks
        // simultáneamente, el INSERT falla con error 23505 → capturamos y devolvemos 409.
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
                feeAmount: input.fee_amount.toFixed(8),
                feeCurrency: input.fee_currency,
                feeTxHash: input.fee_tx_hash,
            });
        } catch (dbError: unknown) {
            // PostgreSQL UNIQUE violation → error 23505
            const pgError = dbError as { code?: string; constraint_name?: string; detail?: string };
            if (pgError.code === '23505') {
                const detail = (pgError.detail ?? pgError.constraint_name ?? '').toLowerCase();
                if (detail.includes('content_hash')) {
                    throw duplicateContentHash();
                }
                if (detail.includes('wallet_nonce') || detail.includes('uq_wallet_nonce')) {
                    throw duplicateNonce();
                }
                if (detail.includes('fee_tx_hash')) {
                    throw feeTxReused();
                }
                // UNIQUE desconocido — devolver conflicto genérico
                throw duplicateContentHash();
            }
            throw dbError; // Re-lanzar errores no esperados
        }

        // 10. Encolar anchor job
        await enqueueAnchorJob(recordId, receiptHash);

        // 11. Responder 201
        return reply.status(201).send({
            record_id: recordId,
            state: 'pending_anchor',
            receipt_hash: receiptHash,
            created_at: createdAt.toISOString(),
        });
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
            record_id: record.recordId,
            content_hash: record.contentHash,
            content_type: record.contentType,
            visibility: record.visibility,
            pog_bundle: record.pogBundle,
            receipt_hash: record.receiptHash,
            created_at: record.createdAt.toISOString(),
            state: record.state,
            fee: {
                amount: record.feeAmount,
                currency: record.feeCurrency,
                tx_hash: record.feeTxHash,
            },
            anchor: record.anchorTxHash
                ? {
                    tx_hash: record.anchorTxHash,
                    block: record.anchorBlock,
                    chain_id: record.anchorChainId,
                    anchored_at: record.anchoredAt?.toISOString() ?? null,
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
        },
        anchor: record.anchorTxHash
            ? {
                tx_hash: record.anchorTxHash,
                block: record.anchorBlock,
                chain_id: record.anchorChainId,
                anchored_at: record.anchoredAt?.toISOString() ?? null,
            }
            : null,
    };
}
