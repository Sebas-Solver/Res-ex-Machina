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
 * Maximum allowed age for the fee transaction.
 * Configurable via FEE_TX_MAX_AGE_HOURS (default: 24h).
 */
const FEE_TX_MAX_AGE_MS = env.FEE_TX_MAX_AGE_HOURS * 60 * 60 * 1000;


/**
 * Fee verification result.
 */
export interface FeeVerificationResult {
    verified: true;
    amount: string;
    recipient: string;
    blockNumber: bigint;
    confirmedAt: Date;
}

/**
 * Verifies that a fee_tx_hash corresponds to a valid payment.
 *
 * Checks (reference: fee-flow-v1.md section 3):
 * 1. tx_exists — The transaction exists on L2
 * 2. tx_confirmed — Has at least 1 confirmation
 * 3. tx_amount — value >= minimum fee
 * 4. tx_recipient — recipient is fee_receiver_address
 * 5. tx_recent — created within the last 24h
 *
 * Note: tx_not_reused is verified via UNIQUE constraint in the DB.
 *
 * @throws ApiError 402 with specific error depending on which check fails
 */
export async function verifyFee(feeTxHash: string): Promise<FeeVerificationResult> {
    // Policy v1: we require a confirmed (mined) tx to consider the fee verified.
    // We use Promise.all to parallelize the 2 required RPC calls:
    //   - getTransaction: to get value and recipient
    //   - getTransactionReceipt: to confirm it's mined (+ blockNumber)

    let tx;
    let receipt;

    try {
        [tx, receipt] = await Promise.all([
            l2Client.getTransaction({ hash: feeTxHash as Hex }),
            l2Client.getTransactionReceipt({ hash: feeTxHash as Hex }),
        ]);
    } catch {
        // If receipt doesn't exist → tx pending or non-existent
        throw feeNotVerified('Transaction not found or not yet confirmed on L2');
    }

    if (!tx || !receipt) {
        throw feeNotVerified('Transaction not found or not yet confirmed on L2');
    }

    // 1. Verify the tx was successful (status 'success')
    if (receipt.status !== 'success') {
        throw feeNotVerified('Transaction failed on-chain');
    }

    // 2. Verify amount >= minimum fee
    const minFeeWei = parseEther(env.FEE_MINIMUM_AMOUNT.toString());
    if (tx.value < minFeeWei) {
        throw feeInsufficient();
    }

    // 3. Verify recipient
    if (tx.to?.toLowerCase() !== env.FEE_RECEIVER_ADDRESS.toLowerCase()) {
        throw feeWrongRecipient();
    }

    // 4. Verify the tx is recent (<=24h)
    // Optimization: we only call getBlock if the previous checks pass.
    // This avoids an unnecessary 3rd RPC call when the tx has already failed
    // a previous check (amount, recipient, status).
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
