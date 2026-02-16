/**
 * On-chain fee payment for RxM.
 *
 * Sends native ETH/MATIC to the fee receiver and waits for confirmation.
 * This module is OPTIONAL: if the user provides feeTxHash (BYO mode),
 * this module is not executed.
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

/** Mapping from chain IDs to viem chain definitions */
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
 * Pays the fee in native currency (ETH/MATIC) and waits for confirmation.
 *
 * @returns Hash of the confirmed fee transaction
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

    // Send fee transaction
    const txHash = await walletClient.sendTransaction({
        to: config.feeReceiverAddress,
        value: parseEther(config.feeAmount.toString()),
    });

    // Wait for confirmation (1 block)
    await publicClient.waitForTransactionReceipt({
        hash: txHash,
        confirmations: 1,
    });

    return txHash;
}
