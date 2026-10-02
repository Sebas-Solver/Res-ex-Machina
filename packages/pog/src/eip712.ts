// SPDX-License-Identifier: Apache-2.0
import { hashTypedData, recoverAddress, type Address, type Hex, type LocalAccount } from 'viem';
import type { PoGDeclaration, PoGDomain } from './types.js';

export const POG_TYPES = {
    PoGDeclaration: [
        { name: 'agent', type: 'address' },
        { name: 'contentHash', type: 'bytes32' },
        { name: 'inputHash', type: 'bytes32' },
        { name: 'modelId', type: 'string' },
        { name: 'runtimeId', type: 'string' },
        { name: 'processType', type: 'uint8' },
        { name: 'humanIntervention', type: 'uint8' },
        { name: 'pipelineSteps', type: 'uint16' },
        { name: 'declaredAt', type: 'uint64' },
        { name: 'nonce', type: 'bytes32' },
        { name: 'metadataHash', type: 'bytes32' },
    ],
} as const;

export function pogDomain(chainId: number, verifyingContract: Address): PoGDomain {
    return { name: 'ResExMachina PoG', version: '2', chainId, verifyingContract };
}

/** EIP-712 digest of the declaration: this is the `proofHash` of a single anchor (§3.3). */
export function declarationDigest(domain: PoGDomain, declaration: PoGDeclaration): Hex {
    return hashTypedData({ domain, types: POG_TYPES, primaryType: 'PoGDeclaration', message: declaration });
}

export async function signDeclaration(account: LocalAccount, domain: PoGDomain, declaration: PoGDeclaration): Promise<Hex> {
    if (account.address.toLowerCase() !== declaration.agent.toLowerCase()) {
        throw new Error('declaration.agent must be the signing account');
    }
    return account.signTypedData({ domain, types: POG_TYPES, primaryType: 'PoGDeclaration', message: declaration });
}

const SECP256K1_HALF_N = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0n;

/** True for a 65-byte r‖s‖v signature with v ∈ {27, 28} and low s (§4). */
export function isCanonicalSignature(signature: Hex): boolean {
    if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) return false;
    const s = BigInt('0x' + signature.slice(66, 130));
    const v = parseInt(signature.slice(130, 132), 16);
    return s > 0n && s <= SECP256K1_HALF_N && (v === 27 || v === 28);
}

export async function recoverDeclarationSigner(digest: Hex, signature: Hex): Promise<Address> {
    if (!isCanonicalSignature(signature)) throw new Error('signature must be 65 bytes, v in {27,28}, low-s');
    return recoverAddress({ hash: digest, signature });
}
