// SPDX-License-Identifier: Apache-2.0
import { keccak256, concat, type Hex } from 'viem';

// Domain-separated tree of spec §5: leaf = keccak(0x00‖digest), node = keccak(0x01‖min‖max).
export const merkleLeaf = (digest: Hex): Hex => keccak256(concat(['0x00', digest]));
export const merkleNode = (a: Hex, b: Hex): Hex =>
    keccak256(concat(['0x01', ...(BigInt(a) < BigInt(b) ? [a, b] : [b, a])]));

export function merkleRoot(digests: Hex[]): Hex {
    if (digests.length === 0) throw new Error('empty batch');
    let level = digests.map(merkleLeaf);
    while (level.length > 1) {
        const next: Hex[] = [];
        for (let i = 0; i < level.length; i += 2) next.push(i + 1 < level.length ? merkleNode(level[i], level[i + 1]) : level[i]);
        level = next;
    }
    return level[0];
}

/** Sibling hashes from leaf to root. A promoted odd node contributes no sibling at that level. */
export function merkleProof(digests: Hex[], index: number): Hex[] {
    if (index < 0 || index >= digests.length) throw new Error('index out of range');
    const proof: Hex[] = [];
    let level = digests.map(merkleLeaf);
    let i = index;
    while (level.length > 1) {
        const sibling = i % 2 === 0 ? i + 1 : i - 1;
        if (sibling < level.length) proof.push(level[sibling]);
        const next: Hex[] = [];
        for (let j = 0; j < level.length; j += 2) next.push(j + 1 < level.length ? merkleNode(level[j], level[j + 1]) : level[j]);
        level = next;
        i = Math.floor(i / 2);
    }
    return proof;
}

export function verifyMerkleProof(digest: Hex, proof: Hex[], root: Hex): boolean {
    let h = merkleLeaf(digest);
    for (const s of proof) h = merkleNode(h, s);
    return h.toLowerCase() === root.toLowerCase();
}
