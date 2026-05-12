// SPDX-License-Identifier: Apache-2.0

import { verifyTypedData, type Hex, type Address } from 'viem';
import { invalidSignature, signerMismatch } from '../utils/errors.js';
import type { PogBundle } from '../routes/schemas/index.js';
import { EIP712_DOMAIN, EIP712_TYPES } from '../constants/eip712.js';

/**
 * Verifica la firma EIP-712 del PoG bundle.
 *
 * 1. Extrae los campos firmables del bundle (sin signature)
 * 2. Recupera el signer de la firma
 * 3. Compara con agent_wallet
 *
 * @throws ApiError 401 invalid_signature if the signature is invalid
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
