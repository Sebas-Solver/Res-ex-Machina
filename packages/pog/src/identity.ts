// SPDX-License-Identifier: Apache-2.0
import { keccak256, toBytes, pad, toHex, type Address, type Hex } from 'viem';

export const AgentIdScheme = { anonymous: 0, registry: 1, uriHash: 2 } as const;

/** CAIP-10 account id with lowercase hex, the canonical scheme-0x02 URI of this profile (§6). */
export function caip10(chainId: number, agent: Address): string {
    return `eip155:${chainId}:${agent.toLowerCase()}`;
}

export function agentIdForKey(chainId: number, agent: Address): Hex {
    return keccak256(toBytes(caip10(chainId, agent)));
}

/** Scheme 0x01 encoding recommended by ERC-8263 for ERC-8004 record ids. */
export function agentIdForRegistryRecord(recordId: bigint): Hex {
    return pad(toHex(recordId), { size: 32 });
}
