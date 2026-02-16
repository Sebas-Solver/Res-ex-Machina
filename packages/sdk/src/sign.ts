/**
 * EIP-712 signing for PoG bundles.
 *
 * Domain and types are defined here as the single source of truth
 * to ensure SDK and server always sign/verify with the same parameters.
 */
import type { Hex, Address, Account } from 'viem';

// ─── EIP-712 Constants (single source of truth: synced with server) ───

/**
 * NOTE: These values are identical to src/constants/eip712.ts on the server.
 * In a monorepo with workspaces, the SDK would import directly from the server.
 * For v0.1 (standalone npm package), they are kept in sync manually.
 * The CI pipeline will fail if they diverge.
 */
export const EIP712_DOMAIN = {
    name: 'ResExMachina',
    version: '1',
    chainId: 0,
    verifyingContract: '0x0000000000000000000000000000000000000000' as Address,
} as const;

export const EIP712_TYPES = {
    PoGBundle: [
        { name: 'schema', type: 'string' },
        { name: 'content_hash', type: 'string' },
        { name: 'agent_wallet', type: 'address' },
        { name: 'model_id', type: 'string' },
        { name: 'runtime_id', type: 'string' },
        { name: 'process_type', type: 'string' },
        { name: 'human_intervention_level', type: 'uint8' },
        { name: 'pipeline_steps', type: 'uint16' },
        { name: 'timestamp', type: 'string' },
        { name: 'nonce', type: 'string' },
    ],
} as const;

/**
 * EIP-712 message for signing — flattened PoG bundle fields.
 */
export interface PoGSignatureMessage {
    schema: string;
    content_hash: string;
    agent_wallet: Address;
    model_id: string;
    runtime_id: string;
    process_type: string;
    human_intervention_level: number;
    pipeline_steps: number;
    timestamp: string;
    nonce: string;
}

/**
 * Signs a PoG bundle with EIP-712 using the provided account.
 *
 * @param account - viem Account (LocalAccount)
 * @param message - Flattened PoG fields
 * @returns EIP-712 signature (0x + 130 hex chars)
 */
export async function signPoGBundle(account: Account, message: PoGSignatureMessage): Promise<Hex> {
    // Account must have signTypedData (LocalAccount)
    if (!account.signTypedData) {
        throw new Error('Account must support signTypedData (use privateKeyToAccount or similar)');
    }

    return account.signTypedData({
        domain: EIP712_DOMAIN,
        types: EIP712_TYPES,
        primaryType: 'PoGBundle',
        message,
    });
}
