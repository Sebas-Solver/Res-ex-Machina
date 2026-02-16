/**
 * Firma EIP-712 para PoG bundles.
 *
 * Importa domain y types desde la fuente única de verdad (src/constants/eip712.ts)
 * para garantizar que SDK y servidor siempre firman/verifican con los mismos parámetros.
 */
import type { Hex, Address, Account } from 'viem';

// ─── EIP-712 Constants (fuente única: compartida con el servidor) ───

/**
 * NOTA: Estos valores son idénticos a src/constants/eip712.ts del servidor.
 * En un monorepo con workspaces, el SDK importaría directamente del servidor.
 * Para v0.1 (publicación npm independiente), se mantienen sincronizados manualmente.
 * El CI del monorepo fallará si divergen.
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
 * Mensaje EIP-712 para firma — campos del PoG bundle aplanados.
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
 * Firma un PoG bundle con EIP-712 usando el account proporcionado.
 *
 * @param account - viem Account (LocalAccount)
 * @param message - Campos del PoG aplanados
 * @returns Firma EIP-712 (0x + 130 hex chars)
 */
export async function signPoGBundle(account: Account, message: PoGSignatureMessage): Promise<Hex> {
    // Account debe tener signTypedData (LocalAccount)
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
