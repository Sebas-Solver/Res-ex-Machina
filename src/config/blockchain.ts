// SPDX-License-Identifier: Apache-2.0

import {
    createPublicClient,
    createWalletClient,
    http,
    type Hex,
    type Chain,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { foundry, baseSepolia } from 'viem/chains';
import { env } from './env.js';

/**
 * Shared blockchain configuration.
 *
 * Centralizes the definition of chain, publicClient, walletClient
 * and anchorAccount that were previously duplicated in:
 * - src/services/anchor.ts  (chain + publicClient + walletClient)
 * - src/services/fee.ts     (publicClient)
 * - src/routes/health.ts    (publicClient)
 */

// --- Chain definition ---

/**
 * Map of known chains.
 * - 31337: Anvil (local development)
 * - 84532: Base Sepolia (testnet alpha)
 *
 * If the chain ID is not in the map, a custom definition is created.
 */
const KNOWN_CHAINS: Record<number, Chain> = {
    31337: foundry,
    84532: baseSepolia,
};

const baseChain = KNOWN_CHAINS[env.L2_CHAIN_ID];

export const l2Chain = baseChain
    ? { ...baseChain, id: env.L2_CHAIN_ID }
    : {
        id: env.L2_CHAIN_ID,
        name: `custom-${env.L2_CHAIN_ID}`,
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: { default: { http: [env.L2_RPC_URL] } },
    };

// --- viem clients ---

/**
 * Public client for reading the blockchain (fee verification, anchor reads, health check).
 * A single shared client for all reads.
 */
export const publicClient = createPublicClient({
    chain: l2Chain,
    transport: http(env.L2_RPC_URL),
});

// --- Anchor-specific (wallet) ---

/**
 * Wallet account for signing anchoring transactions.
 * Uses the private key configured in ANCHOR_WALLET_PRIVATE_KEY.
 */
export const anchorAccount = privateKeyToAccount(env.ANCHOR_WALLET_PRIVATE_KEY as Hex);

/**
 * Wallet client for sending anchoring transactions.
 */
export const walletClient = createWalletClient({
    account: anchorAccount,
    chain: l2Chain,
    transport: http(env.L2_RPC_URL),
});
