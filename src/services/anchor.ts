import {
    createPublicClient,
    createWalletClient,
    http,
    type Hex,
    type Address,
    type Chain,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { foundry, baseSepolia } from 'viem/chains';
import { env } from '../config/env.js';
import { db } from '../db/index.js';
import { records } from '../db/schema.js';
import { eq } from 'drizzle-orm';

/**
 * Cuenta wallet para firmar transacciones de anchoring.
 * Usa la private key configurada en ANCHOR_WALLET_PRIVATE_KEY.
 */
const anchorAccount = privateKeyToAccount(env.ANCHOR_WALLET_PRIVATE_KEY as Hex);

/**
 * Mapa de chains conocidas.
 * Permite seleccionar la chain correcta por L2_CHAIN_ID.
 *
 * - 31337: Anvil (desarrollo local)
 * - 84532: Base Sepolia (testnet alpha)
 *
 * Si el chain ID no está en el mapa, se crea una definición custom.
 */
const KNOWN_CHAINS: Record<number, Chain> = {
    31337: foundry,
    84532: baseSepolia,
};

const baseChain = KNOWN_CHAINS[env.L2_CHAIN_ID];
const chain = baseChain
    ? { ...baseChain, id: env.L2_CHAIN_ID }
    : {
        id: env.L2_CHAIN_ID,
        name: `custom-${env.L2_CHAIN_ID}`,
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: { default: { http: [env.L2_RPC_URL] } },
    };

/**
 * Cliente público para leer la blockchain.
 */
const publicClient = createPublicClient({
    chain,
    transport: http(env.L2_RPC_URL),
});

/**
 * Cliente wallet para enviar transacciones.
 */
const walletClient = createWalletClient({
    account: anchorAccount,
    chain,
    transport: http(env.L2_RPC_URL),
});

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
}
