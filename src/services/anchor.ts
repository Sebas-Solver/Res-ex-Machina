import { type Hex, type Address } from 'viem';
import { env } from '../config/env.js';
import { publicClient, walletClient } from '../config/blockchain.js';
import { db } from '../db/index.js';
import { records } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { enqueueWebhookDispatch } from './webhookDispatcher.js';
import { logger } from '../utils/logger.js';
import { Sentry } from '../config/monitoring.js';


/**
 * Resultado de un anchoring exitoso.
 */
export interface AnchorResult {
    txHash: string;
    block: number;
    chainId: number;
}

/**
 * Ancla un receipt_hash en la blockchain L2.
 *
 * The transaction is a simple transfer to the fee receiver address
 * con 0 valor, pero con el receipt_hash codificado en el input data.
 * Esto crea una huella inmutable en la blockchain.
 *
 * @param recordId - UUID del record
 * @param receiptHash - Hash a grabar on-chain (en el calldata)
 * @returns AnchorResult con tx hash, bloque y chain ID
 */
export async function anchorRecord(
    recordId: string,
    receiptHash: string,
    agentWallet?: string,
): Promise<AnchorResult> {
    // IDEMPOTENCY CHECK (Audit fix: prevents duplicate on-chain txs when
    // BullMQ re-executes stalled/retried jobs). If the record is already
    // anchored, return existing data without sending a new transaction.
    const [existing] = await db
        .select({
            state: records.state,
            anchorTxHash: records.anchorTxHash,
            anchorBlock: records.anchorBlock,
            anchorChainId: records.anchorChainId,
        })
        .from(records)
        .where(eq(records.recordId, recordId))
        .limit(1);

    if (existing?.state === 'anchored' && existing.anchorTxHash) {
        return {
            txHash: existing.anchorTxHash,
            block: Number(existing.anchorBlock),
            chainId: existing.anchorChainId ?? env.L2_CHAIN_ID,
        };
    }

    // Codificar el receipt_hash como bytes para el calldata
    const encoder = new TextEncoder();
    const data = `0x${Buffer.from(encoder.encode(receiptHash)).toString('hex')}` as Hex;

    // Send transaction with receipt_hash in calldata
    const txHash = await walletClient.sendTransaction({
        to: env.FEE_RECEIVER_ADDRESS as Address,
        value: 0n,
        data,
    });

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
    });

    const result: AnchorResult = {
        txHash,
        block: Number(receipt.blockNumber),
        chainId: env.L2_CHAIN_ID,
    };

    // Actualizar el record en la DB
    await db
        .update(records)
        .set({
            state: 'anchored',
            anchorTxHash: result.txHash,
            anchorBlock: result.block,
            anchorChainId: result.chainId,
            anchoredAt: new Date(),
        })
        .where(eq(records.recordId, recordId));

    // Disparar webhooks (async, no bloquea) — Issue #13
    try {
        // Use agentWallet from job data if available, otherwise fetch from DB
        let wallet = agentWallet;
        if (!wallet) {
            const [record] = await db.select({ agentWallet: records.agentWallet })
                .from(records).where(eq(records.recordId, recordId)).limit(1);
            wallet = record?.agentWallet;
        }
        if (wallet) {
            await enqueueWebhookDispatch(
                wallet, recordId, 'pending_anchor', 'anchored',
                { txHash: result.txHash, block: result.block, chainId: result.chainId },
            );
        }
    } catch (webhookErr) {
        /* webhook dispatch failure must never block anchoring */
        logger.warn({ recordId, error: webhookErr instanceof Error ? webhookErr.message : String(webhookErr) },
            '[anchor] Webhook dispatch failed (non-blocking)');
    }

    return result;
}

/**
 * Marks a record as anchor_failed in the DB.
 * Called when all retries are exhausted.
 *
 * L-01: Emits a Sentry alert so that operators
 * detect accumulated failures (possible RPC/L2 issue).
 */
export async function markAnchorFailed(
    recordId: string,
    reason: string,
    retries: number,
): Promise<void> {
    await db
        .update(records)
        .set({
            state: 'anchor_failed',
            anchorErrorReason: reason,
            anchorRetries: retries,
        })
        .where(eq(records.recordId, recordId));

    // L-01: Alert via Sentry (only if configured)
    Sentry.captureMessage(`Anchor failed: ${recordId}`, {
        level: 'warning',
        tags: { component: 'anchor', recordId },
        extra: { reason, retries },
    });

    logger.error({ recordId, reason, retries }, '❌ Record anchor permanently failed');

    // Disparar webhooks (async, no bloquea) — Issue #13
    try {
        const [record] = await db.select({ agentWallet: records.agentWallet })
            .from(records).where(eq(records.recordId, recordId)).limit(1);
        if (record) {
            await enqueueWebhookDispatch(
                record.agentWallet, recordId, 'pending_anchor', 'anchor_failed',
            );
        }
    } catch (webhookErr) {
        /* webhook dispatch failure must never block anchoring */
        logger.warn({ recordId, error: webhookErr instanceof Error ? webhookErr.message : String(webhookErr) },
            '[anchor] Webhook dispatch failed (non-blocking)');
    }
}
