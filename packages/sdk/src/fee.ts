/**
 * Pago de fee on-chain para RxM.
 *
 * Envía ETH/MATIC nativo al fee receiver y espera confirmación.
 * Este módulo es OPCIONAL: si el usuario proporciona feeTxHash (modo BYO),
 * este módulo no se ejecuta.
 */
import {
    createWalletClient,
    createPublicClient,
    http,
    parseEther,
    type Hex,
    type Address,
    type Account,
    type Chain,
} from 'viem';
import { baseSepolia, polygon, base } from 'viem/chains';

/** Mapeo de chain IDs a definiciones de chain de viem */
const CHAIN_MAP: Record<number, Chain> = {
    84532: baseSepolia,
    137: polygon,
    8453: base,
};

export interface FeeConfig {
    account: Account;
    rpcUrl: string;
    chainId: number;
    feeReceiverAddress: Address;
    feeAmount: number;
}

/**
 * Paga el fee en nativo (ETH/MATIC) y espera confirmación.
 *
 * @returns Hash de la transacción de fee confirmada
 */
export async function payFee(config: FeeConfig): Promise<Hex> {
    const chain = CHAIN_MAP[config.chainId];
    if (!chain) {
        throw new Error(`Chain ID ${config.chainId} not supported. Supported: ${Object.keys(CHAIN_MAP).join(', ')}`);
    }

    const walletClient = createWalletClient({
        account: config.account,
        chain,
        transport: http(config.rpcUrl),
    });

    const publicClient = createPublicClient({
        chain,
        transport: http(config.rpcUrl),
    });

    // Enviar transacción de fee
    const txHash = await walletClient.sendTransaction({
        to: config.feeReceiverAddress,
        value: parseEther(config.feeAmount.toString()),
    });

    // Esperar confirmación (1 bloque)
    await publicClient.waitForTransactionReceipt({
        hash: txHash,
        confirmations: 1,
    });

    return txHash;
}
