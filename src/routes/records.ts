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
    fastify.post('/', async (request, reply) => {
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

        // 3. Check idempotencia — content_hash ya existe?
        const existingByHash = await db
            .select({ recordId: records.recordId })
            .from(records)
            .where(eq(records.contentHash, pog_bundle.content_hash))
            .limit(1);

        if (existingByHash.length > 0) {
            throw duplicateContentHash();
        }

        // 4. Check nonce duplicado — misma wallet + mismo nonce?
        const existingByNonce = await db
            .select({ recordId: records.recordId })
            .from(records)
            .where(
                and(
                    eq(records.agentWallet, pog_bundle.agent_wallet),
                    eq(records.nonce, pog_bundle.nonce),
                ),
            )
            .limit(1);

        if (existingByNonce.length > 0) {
            throw duplicateNonce();
        }

        // 5. Verificar fee on-chain
        await verifyFee(input.fee_tx_hash);

        // 6. Check fee_tx_hash no reusado
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

    // --- Endpoints de consulta (Issue #5) —- placeholders ---

    fastify.get('/:id', async (_request, reply) => {
        return reply.status(501).send({
            error: {
                code: 'not_implemented',
                message: 'GET /records/:id will be implemented in Issue #5',
            },
        });
    });

    fastify.get('/verify', async (_request, reply) => {
        return reply.status(501).send({
            error: {
                code: 'not_implemented',
                message: 'GET /records/verify will be implemented in Issue #5',
            },
        });
    });

    fastify.get('/:id/export', async (_request, reply) => {
        return reply.status(501).send({
            error: {
                code: 'not_implemented',
                message: 'GET /records/:id/export will be implemented in Issue #5',
            },
        });
    });
}
