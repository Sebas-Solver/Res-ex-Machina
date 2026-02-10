import {
    createPublicClient,
    http,
    formatEther,
    type Hex,
    type Address,
} from 'viem';
import { env } from '../config/env.js';
import {
    feeNotVerified,
    feeInsufficient,
    feeWrongRecipient,
    feeTxExpired,
} from '../utils/errors.js';

/**
 * Máxima antigüedad permitida para la tx de fee (24 horas).
 */
const FEE_TX_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Cliente público de viem para consultar la L2.
 * Se conecta al L2_RPC_URL configurado (Anvil en dev, Polygon en prod).
 */
const l2Client = createPublicClient({
    transport: http(env.L2_RPC_URL),
});

/**
 * Resultado de la verificación de fee.
 */
export interface FeeVerificationResult {
    verified: true;
    amount: string;
    recipient: string;
    blockNumber: bigint;
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
    // 1. Obtener la transacción
    let tx;
    try {
        tx = await l2Client.getTransaction({ hash: feeTxHash as Hex });
    } catch {
        throw feeNotVerified('Transaction not found on L2');
    }

    if (!tx) {
        throw feeNotVerified('Transaction not found on L2');
    }

    // 2. Verificar que está confirmada (tiene blockNumber)
    if (!tx.blockNumber) {
        throw feeNotVerified('Transaction is not yet confirmed');
    }

    // 3. Verificar monto >= fee mínimo
    const txValueEth = parseFloat(formatEther(tx.value));
    if (txValueEth < env.FEE_MINIMUM_AMOUNT) {
        throw feeInsufficient();
    }

    // 4. Verificar destinatario
    if (tx.to?.toLowerCase() !== env.FEE_RECEIVER_ADDRESS.toLowerCase()) {
        throw feeWrongRecipient();
    }

    // 5. Verificar que la tx es reciente (<=24h)
    // Obtener el bloque para saber el timestamp
    const block = await l2Client.getBlock({ blockNumber: tx.blockNumber });
    const txTimestamp = Number(block.timestamp) * 1000; // block.timestamp es en segundos
    const now = Date.now();

    if (now - txTimestamp > FEE_TX_MAX_AGE_MS) {
        throw feeTxExpired();
    }

    return {
        verified: true,
        amount: formatEther(tx.value),
        recipient: tx.to as string,
        blockNumber: tx.blockNumber,
    };
}
