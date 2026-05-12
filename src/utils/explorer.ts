// SPDX-License-Identifier: Apache-2.0

/**
 * Mapeo de chain IDs a explorers de blockchain.
 *
 * Generates explorer URLs automatically so that
 * los developers/agentes no tengan que construirlas manualmente.
 */

interface ExplorerConfig {
    name: string;
    baseUrl: string;
}

const EXPLORERS: Record<number, ExplorerConfig> = {
    1: { name: 'Ethereum Mainnet', baseUrl: 'https://etherscan.io' },
    5: { name: 'Goerli', baseUrl: 'https://goerli.etherscan.io' },
    11155111: { name: 'Sepolia', baseUrl: 'https://sepolia.etherscan.io' },
    137: { name: 'Polygon', baseUrl: 'https://polygonscan.com' },
    80001: { name: 'Polygon Mumbai', baseUrl: 'https://mumbai.polygonscan.com' },
    8453: { name: 'Base', baseUrl: 'https://basescan.org' },
    84532: { name: 'Base Sepolia', baseUrl: 'https://sepolia.basescan.org' },
    42161: { name: 'Arbitrum One', baseUrl: 'https://arbiscan.io' },
    10: { name: 'Optimism', baseUrl: 'https://optimistic.etherscan.io' },
};

/**
 * Returns the explorer URL for a transaction.
 * @returns URL completa o null si no hay explorer para esa chain.
 */
export function getExplorerTxUrl(chainId: number, txHash: string): string | null {
    const explorer = EXPLORERS[chainId];
    if (!explorer) return null;
    return `${explorer.baseUrl}/tx/${txHash}`;
}

/**
 * Devuelve el nombre legible de la red para una chain.
 * @returns Nombre de la red o null si no se conoce.
 */
export function getNetworkName(chainId: number): string | null {
    return EXPLORERS[chainId]?.name ?? null;
}
