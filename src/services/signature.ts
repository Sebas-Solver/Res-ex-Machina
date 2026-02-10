import { verifyTypedData, type Hex, type Address } from 'viem';
import { invalidSignature, signerMismatch } from '../utils/errors.js';
import type { PogBundle } from '../routes/schemas/index.js';

/**
 * EIP-712 Domain — off-chain (chainId: 0, sin contrato).
 * Referencia: pog-v1-spec.md sección 4.1
 */
const EIP712_DOMAIN = {
    name: 'ResExMachina',
    version: '1',
    chainId: 0,
    verifyingContract: '0x0000000000000000000000000000000000000000' as Address,
} as const;

/**
 * EIP-712 Types — estructura PoGBundle.
 * Referencia: pog-v1-spec.md sección 4.2
 */
const EIP712_TYPES = {
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
 * Verifica la firma EIP-712 del PoG bundle.
 *
 * 1. Extrae los campos firmables del bundle (sin signature)
 * 2. Recupera el signer de la firma
 * 3. Compara con agent_wallet
 *
 * @throws ApiError 401 invalid_signature si la firma es inválida
 * @throws ApiError 401 signer_mismatch si el signer ≠ agent_wallet
 */
export async function verifyPoGSignature(bundle: PogBundle): Promise<void> {
    const { signature, generation_process, ...rest } = bundle;

    // Mensaje para verificar — flatten generation_process
    const message = {
        ...rest,
        agent_wallet: rest.agent_wallet as Address,
        process_type: generation_process.process_type,
        human_intervention_level: generation_process.human_intervention_level,
        pipeline_steps: generation_process.pipeline_steps,
    };

    try {
        const isValid = await verifyTypedData({
            address: bundle.agent_wallet as Address,
            domain: EIP712_DOMAIN,
            types: EIP712_TYPES,
            primaryType: 'PoGBundle',
            message,
            signature: signature as Hex,
        });

        if (!isValid) {
            throw signerMismatch('unknown', bundle.agent_wallet);
        }
    } catch (error) {
        // Si el error ya es un ApiError, re-lanzar
        if (error instanceof Error && error.name === 'ApiError') {
            throw error;
        }
        // Error de viem (firma malformada, etc.)
        throw invalidSignature();
    }
}
