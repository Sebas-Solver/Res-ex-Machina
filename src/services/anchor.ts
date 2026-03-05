import { type Hex, type Address } from 'viem';
import { env } from '../config/env.js';
import { publicClient, walletClient, anchorAccount } from '../config/blockchain.js';
import { db } from '../db/index.js';
import { records } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { enqueueWebhookDispatch } from './webhookDispatcher.js';


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
 * La transacción es un simple transfer a la dirección del fee receiver
 * con 0 valor, pero con el receipt_hash codificado en el input data.
 * Esto crea una huella inmutable en la blockchain.
 *
 * @param recordId - UUID del record
 * @param receiptHash - Hash a grabar on-chain (en el calldata)
 * @returns AnchorResult con tx hash, bloque y chain ID
 */
export async function anchorRecord(
    recordId: string,
    _contentHash: string,
    receiptHash: string,
): Promise<AnchorResult> {
    // Codificar el receipt_hash como bytes para el calldata
    const encoder = new TextEncoder();
    const data = `0x${Buffer.from(encoder.encode(receiptHash)).toString('hex')}` as Hex;

    // Enviar transacción con receipt_hash en calldata
    const txHash = await walletClient.sendTransaction({
        to: env.FEE_RECEIVER_ADDRESS as Address,
        value: 0n,
        data,
    });

    // Esperar confirmación
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
        // Obtener wallet del record para buscar webhooks
        const [record] = await db.select({ agentWallet: records.agentWallet })
            .from(records).where(eq(records.recordId, recordId)).limit(1);
        if (record) {
            await enqueueWebhookDispatch(
                record.agentWallet, recordId, 'pending_anchor', 'anchored',
                { txHash: result.txHash, block: result.block, chainId: result.chainId },
            );
        }
    } catch (webhookErr) {
        /* webhook dispatch failure must never block anchoring */
        console.warn('[anchor] ⚠️ Webhook dispatch falló (no bloquea)', {
            recordId,
            error: webhookErr instanceof Error ? webhookErr.message : String(webhookErr),
        });
    }

    return result;
}

/**
 * Marca un record como anchor_failed en la DB.
 * Se llama cuando se agotan todos los reintentos.
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
        console.warn('[anchor] ⚠️ Webhook dispatch falló (no bloquea)', {
            recordId,
            error: webhookErr instanceof Error ? webhookErr.message : String(webhookErr),
        });
    }
}
