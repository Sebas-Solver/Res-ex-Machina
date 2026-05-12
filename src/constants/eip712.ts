// SPDX-License-Identifier: Apache-2.0

import type { Address } from 'viem';

/**
 * EIP-712 Domain — off-chain (chainId: 0, sin contrato).
 *
 * Single source of truth: server and SDK import from here.
 * Reference: pog-v1-spec.md section 4.1
 *
 * ⚠️  Modifying these values will break ALL existing signatures.
 *     Si necesitas versionarlos, crea un nuevo archivo (eip712-v2.ts).
 */
export const EIP712_DOMAIN = {
    name: 'ResExMachina',
    version: '1',
    chainId: 0,
    verifyingContract: '0x0000000000000000000000000000000000000000' as Address,
} as const;

/**
 * EIP-712 Types — estructura PoGBundle.
 * Reference: pog-v1-spec.md section 4.2
 */
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
