// SPDX-License-Identifier: Apache-2.0
import { createPublicClient, http, type Address, type Hex, type PublicClient } from 'viem';
import type { PoGDeclaration, PoGDomain } from './types.js';
import { verifyFromChain, type VerifyResult } from './verify.js';

/** Public RPCs used when the caller does not pass one. */
export const DEFAULT_RPC: Record<number, string> = {
    8453: 'https://mainnet.base.org',
    84532: 'https://sepolia.base.org',
    31337: 'http://127.0.0.1:8545',
};

export interface ParsedReceipt {
    declaration: PoGDeclaration;
    signature: Hex;
    domain: PoGDomain;
    locator: { transactionHash: Hex; logIndex: number } | null;
}

/** Parse a receipt as returned by GET /v2/declarations/:digest (or saved to a file). */
export function parseReceipt(json: unknown): ParsedReceipt {
    const r = json as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!r || r.profile !== 'rxm-pog-v2') throw new Error('not an rxm-pog-v2 receipt (profile field)');
    const d = r.declaration;
    if (!d || typeof d.declaredAt === 'undefined') throw new Error('receipt has no declaration');
    const dom = r.domain;
    if (!dom || dom.name !== 'ResExMachina PoG' || dom.version !== '2') throw new Error('receipt has no rxm-pog-v2 domain');
    return {
        declaration: { ...d, agent: d.agent as Address, declaredAt: BigInt(d.declaredAt) },
        signature: r.signature as Hex,
        domain: { name: 'ResExMachina PoG', version: '2', chainId: Number(dom.chainId), verifyingContract: dom.verifyingContract as Address },
        locator: r.anchor ? { transactionHash: r.anchor.transactionHash as Hex, logIndex: Number(r.anchor.logIndex) } : null,
    };
}

/**
 * Verify a receipt against the chain. The receipt's own `anchor`, `statement` and `state` fields are
 * NOT trusted: only the declaration, the signature, the domain and the locator are used, and every
 * claim is re-derived from chain data.
 */
export async function verifyReceipt(
    json: unknown,
    opts: { client?: PublicClient; rpcUrl?: string; content?: Uint8Array | string } = {},
): Promise<VerifyResult> {
    const p = parseReceipt(json);
    if (!p.locator) {
        return { valid: false, warnings: [], checks: [{ name: 'anchor', ok: false, detail: 'receipt has no anchor yet (state is not anchored)' }] };
    }
    const rpc = opts.rpcUrl ?? DEFAULT_RPC[p.domain.chainId];
    if (!opts.client && !rpc) throw new Error(`no RPC known for chain ${p.domain.chainId}; pass one`);
    const client = opts.client ?? (createPublicClient({ transport: http(rpc) }) as PublicClient);
    return verifyFromChain(client, p.locator, { declaration: p.declaration, signature: p.signature, domain: p.domain, content: opts.content });
}
