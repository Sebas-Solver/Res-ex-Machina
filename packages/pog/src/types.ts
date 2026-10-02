// SPDX-License-Identifier: Apache-2.0
import type { Address, Hex } from 'viem';

/** Process types, same four values as PoG v1. */
export const ProcessType = {
    direct: 0,
    pipeline: 1,
    iterative: 2,
    autonomous: 3,
} as const;
export type ProcessTypeValue = (typeof ProcessType)[keyof typeof ProcessType];

/**
 * A signed generation declaration (spec/rxm-pog-v2.md §3).
 * Every field except `agent` and the hashes is a DECLARATION by the signer, never a verified fact.
 */
export interface PoGDeclaration {
    agent: Address;
    contentHash: Hex;
    inputHash: Hex;
    modelId: string;
    runtimeId: string;
    processType: number;
    humanIntervention: number;
    pipelineSteps: number;
    declaredAt: bigint;
    nonce: Hex;
    metadataHash: Hex;
}

/** EIP-712 domain of the anchoring deployment (§3.1). */
export interface PoGDomain {
    name: 'ResExMachina PoG';
    version: '2';
    chainId: number;
    verifyingContract: Address;
}

export const ZERO_HASH: Hex = '0x0000000000000000000000000000000000000000000000000000000000000000';
