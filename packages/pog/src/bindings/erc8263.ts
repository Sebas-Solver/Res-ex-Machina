// SPDX-License-Identifier: Apache-2.0
/**
 * Anchoring binding for ERC-8263 (draft, ethereum/ERCs PR #1748).
 * The declaration format does not depend on this file: if ERC-8263 changes or another anchoring
 * standard appears, add a new binding next to this one and keep existing anchors verifiable.
 */
import {
    keccak256, toBytes, concat, size, slice, decodeEventLog, encodeEventTopics, parseAbi,
    type Hex, type Log,
} from 'viem';

export const ERC8263_ABI = parseAbi([
    'event AnchorProof(uint8 agentIdScheme, bytes32 indexed agentId, bytes32 indexed proofHash, address indexed operator, bytes aux)',
    'function anchor(uint8 agentIdScheme, bytes32 agentId, bytes32 proofHash)',
    'function anchorWithAux(uint8 agentIdScheme, bytes32 agentId, bytes32 proofHash, bytes aux)',
]);

export const ERC8263_TOPIC0: Hex = encodeEventTopics({ abi: ERC8263_ABI, eventName: 'AnchorProof' })[0] as Hex;

export const SELECTOR_SINGLE: Hex = slice(keccak256(toBytes('rxm-pog-v2/single')), 0, 4);
export const SELECTOR_BATCH: Hex = slice(keccak256(toBytes('rxm-pog-v2/batch')), 0, 4);

export type DecodedAux =
    | { kind: 'single'; signature: Hex }
    | { kind: 'batch'; bundleHash: Hex };

export function encodeSingleAux(signature: Hex): Hex {
    if (size(signature) !== 65) throw new Error('signature must be 65 bytes');
    return concat([SELECTOR_SINGLE, signature]);
}

export function encodeBatchAux(bundleHash: Hex): Hex {
    if (size(bundleHash) !== 32) throw new Error('bundleHash must be 32 bytes');
    return concat([SELECTOR_BATCH, bundleHash]);
}

export function decodeAux(aux: Hex): DecodedAux {
    const sel = size(aux) >= 4 ? slice(aux, 0, 4).toLowerCase() : '';
    if (sel === SELECTOR_SINGLE.toLowerCase() && size(aux) === 69) return { kind: 'single', signature: slice(aux, 4) };
    if (sel === SELECTOR_BATCH.toLowerCase() && size(aux) === 36) return { kind: 'batch', bundleHash: slice(aux, 4) };
    throw new Error('aux is not an rxm-pog-v2 payload');
}

export interface AnchorEvent {
    contract: Hex;
    agentIdScheme: number;
    agentId: Hex;
    proofHash: Hex;
    operator: Hex;
    aux: Hex;
    blockNumber: bigint;
    logIndex: number;
    transactionHash: Hex;
}

/** Decode an AnchorProof log. Throws if the log is not an ERC-8263 AnchorProof event. */
export function decodeAnchorLog(log: Log): AnchorEvent {
    if (!log.topics[0] || log.topics[0].toLowerCase() !== ERC8263_TOPIC0.toLowerCase()) throw new Error('not an AnchorProof log');
    const { args } = decodeEventLog({ abi: ERC8263_ABI, eventName: 'AnchorProof', data: log.data, topics: log.topics as [Hex, ...Hex[]] });
    if (log.blockNumber == null || log.logIndex == null || !log.transactionHash) throw new Error('pending log');
    return {
        contract: log.address,
        agentIdScheme: Number(args.agentIdScheme),
        agentId: args.agentId,
        proofHash: args.proofHash,
        operator: args.operator,
        aux: args.aux,
        blockNumber: log.blockNumber,
        logIndex: log.logIndex,
        transactionHash: log.transactionHash,
    };
}
