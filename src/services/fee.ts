import {
    formatEther,
    parseEther,
    type Hex,
} from 'viem';
import { env } from '../config/env.js';
import { publicClient as l2Client } from '../config/blockchain.js';
import {
    feeNotVerified,
    feeInsufficient,
    feeWrongRecipient,
    feeTxExpired,
} from '../utils/errors.js';

/**
 * Máxima antigüedad permitida para la tx de fee.
 * Configurable via FEE_TX_MAX_AGE_HOURS (default: 24h).
 */
const FEE_TX_MAX_AGE_MS = env.FEE_TX_MAX_AGE_HOURS * 60 * 60 * 1000;


/**
 * Resultado de la verificación de fee.
 */
export interface FeeVerificationResult {
    verified: true;
    amount: string;
    recipient: string;
    blockNumber: bigint;
    confirmedAt: Date;
}

/**
 * Verifica que un fee_tx_hash corresponde a un pago válido.
 *
 * Checks (referencia: fee-flow-v1.md sección 3):
 * 1. tx_exists — La transacción existe en la L2
 * 2. tx_confirmed — Tiene al menos 1 confirmación
 * 3. tx_amount — value >= fee mínimo
 * 4. tx_recipient — destinatario es fee_receiver_address
 * 5. tx_recent — creada en las últimas 24h
 *
 * Nota: tx_not_reused se verifica via UNIQUE constraint en la DB.
 *
 * @throws ApiError 402 con error específico según el check que falle
 */
export async function verifyFee(feeTxHash: string): Promise<FeeVerificationResult> {
    // Política v1: exigimos tx confirmada (mined) para considerar fee verificado.
    // Usamos Promise.all para paralelizar las 2 RPC calls necesarias:
    //   - getTransaction: para obtener value y recipient
    //   - getTransactionReceipt: para confirmar que está minada (+ blockNumber)

    let tx;
    let receipt;

    try {
        [tx, receipt] = await Promise.all([
            l2Client.getTransaction({ hash: feeTxHash as Hex }),
            l2Client.getTransactionReceipt({ hash: feeTxHash as Hex }),
        ]);
    } catch {
        // Si receipt no existe → tx pendiente o inexistente
        throw feeNotVerified('Transaction not found or not yet confirmed on L2');
    }

    if (!tx || !receipt) {
        throw feeNotVerified('Transaction not found or not yet confirmed on L2');
    }

    // 1. Verificar que la tx fue exitosa (status 'success')
    if (receipt.status !== 'success') {
        throw feeNotVerified('Transaction failed on-chain');
    }

    // 2. Verificar monto >= fee mínimo
    const minFeeWei = parseEther(env.FEE_MINIMUM_AMOUNT.toString());
    if (tx.value < minFeeWei) {
        throw feeInsufficient();
    }

    // 3. Verificar destinatario
    if (tx.to?.toLowerCase() !== env.FEE_RECEIVER_ADDRESS.toLowerCase()) {
        throw feeWrongRecipient();
    }

    // 4. Verificar que la tx es reciente (<=24h)
    // Optimización: solo hacemos getBlock si los checks anteriores pasan.
    // Esto evita una 3ª RPC call innecesaria cuando la tx ya ha fallado
    // en algún check anterior (monto, recipient, status).
    const block = await l2Client.getBlock({ blockNumber: receipt.blockNumber });
    const txTimestamp = Number(block.timestamp) * 1000;
    const now = Date.now();

    if (now - txTimestamp > FEE_TX_MAX_AGE_MS) {
        throw feeTxExpired();
    }

    return {
        verified: true,
        amount: formatEther(tx.value),
        recipient: tx.to as string,
        blockNumber: receipt.blockNumber,
        confirmedAt: new Date(txTimestamp),
    };
}
