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
 * Configuración blockchain compartida.
 *
 * Centraliza la definición de chain, publicClient, walletClient
 * y anchorAccount que antes se duplicaban en:
 * - src/services/anchor.ts  (chain + publicClient + walletClient)
 * - src/services/fee.ts     (publicClient)
 * - src/routes/health.ts    (publicClient)
 */

// --- Chain definition ---

/**
 * Mapa de chains conocidas.
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

export const l2Chain = baseChain
    ? { ...baseChain, id: env.L2_CHAIN_ID }
    : {
        id: env.L2_CHAIN_ID,
        name: `custom-${env.L2_CHAIN_ID}`,
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: { default: { http: [env.L2_RPC_URL] } },
    };

// --- Clientes viem ---

/**
 * Cliente público para leer la blockchain (fee verification, anchor reads, health check).
 * Un solo cliente compartido para todas las lecturas.
 */
export const publicClient = createPublicClient({
    chain: l2Chain,
    transport: http(env.L2_RPC_URL),
});

// --- Anchor-specific (wallet) ---

/**
 * Cuenta wallet para firmar transacciones de anchoring.
 * Usa la private key configurada en ANCHOR_WALLET_PRIVATE_KEY.
 */
export const anchorAccount = privateKeyToAccount(env.ANCHOR_WALLET_PRIVATE_KEY as Hex);

/**
 * Cliente wallet para enviar transacciones de anchoring.
 */
export const walletClient = createWalletClient({
    account: anchorAccount,
    chain: l2Chain,
    transport: http(env.L2_RPC_URL),
});
