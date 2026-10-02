// SPDX-License-Identifier: Apache-2.0
import type { Address, Hex, Log, PublicClient } from 'viem';
import type { PoGDeclaration, PoGDomain } from './types.js';
import { validateDeclaration } from './validate.js';
import { declarationDigest, recoverDeclarationSigner } from './eip712.js';
import { sha256 } from './content.js';
import { AgentIdScheme, agentIdForKey } from './identity.js';
import { verifyMerkleProof } from './merkle.js';
import { decodeAnchorLog, decodeAux, type AnchorEvent } from './bindings/erc8263.js';

export interface VerifyInput {
    declaration: PoGDeclaration;
    signature: Hex;
    domain: PoGDomain;
    /** The AnchorProof log, as returned by an RPC for the anchoring transaction. */
    log: Log;
    /** Timestamp of the block that contains the log. */
    blockTimestamp: bigint;
    /** Merkle proof, required for batch anchors. */
    merkleProof?: Hex[];
    /** The content bytes, if the verifier has them. */
    content?: Uint8Array | string;
    /** For scheme 0x01: current wallet bound to the registry record, or null if none. */
    resolveRegistryWallet?: (agentId: Hex) => Promise<Address | null>;
}

export interface Check { name: string; ok: boolean; detail: string }

export interface VerifyResult {
    /** True only if every mandatory check passed. Warnings do not affect it. */
    valid: boolean;
    checks: Check[];
    warnings: string[];
    anchor?: AnchorEvent;
    /** The only statement a valid result supports (spec §1). */
    statement?: string;
}

const MAX_FUTURE_SKEW = 300n;

/**
 * Verify an rxm-pog-v2 declaration against its anchor using chain data only (spec §7).
 * No Res ex Machina service is involved.
 */
export async function verifyDeclaration(input: VerifyInput): Promise<VerifyResult> {
    const checks: Check[] = [];
    const warnings: string[] = [];
    const add = (name: string, ok: boolean, detail: string) => { checks.push({ name, ok, detail }); return ok; };
    const fail = (): VerifyResult => ({ valid: false, checks, warnings });

    const { declaration: d, domain } = input;

    let ev: AnchorEvent;
    try { ev = decodeAnchorLog(input.log); add('event', true, 'ERC-8263 AnchorProof log'); }
    catch (e) { add('event', false, (e as Error).message); return fail(); }

    if (!add('contract', ev.contract.toLowerCase() === domain.verifyingContract.toLowerCase(),
        `emitted by ${ev.contract}, domain expects ${domain.verifyingContract}`)) return fail();

    let aux;
    try { aux = decodeAux(ev.aux); add('aux', true, `rxm-pog-v2/${aux.kind}`); }
    catch (e) { add('aux', false, (e as Error).message); return fail(); }

    const problems = validateDeclaration(d);
    if (!add('declaration', problems.length === 0, problems.join('; ') || 'well formed')) return fail();

    const digest = declarationDigest(domain, d);
    if (aux.kind === 'single') {
        if (!add('proofHash', digest.toLowerCase() === ev.proofHash.toLowerCase(), 'EIP-712 digest equals proofHash')) return fail();
        if (!add('signature-in-anchor', aux.signature.toLowerCase() === input.signature.toLowerCase(),
            'signature given equals the one anchored in aux')) return fail();
    } else {
        if (!input.merkleProof) { add('merkle', false, 'batch anchor needs a Merkle proof'); return fail(); }
        if (!add('merkle', verifyMerkleProof(digest, input.merkleProof, ev.proofHash), 'digest included in anchored root')) return fail();
    }

    try {
        const signer = await recoverDeclarationSigner(digest, input.signature);
        if (!add('signer', signer.toLowerCase() === d.agent.toLowerCase(), `recovered ${signer}`)) return fail();
    } catch (e) { add('signer', false, (e as Error).message); return fail(); }

    if (aux.kind === 'single') {
        if (ev.agentIdScheme === AgentIdScheme.uriHash) {
            if (!add('agentId', ev.agentId.toLowerCase() === agentIdForKey(domain.chainId, d.agent).toLowerCase(),
                'agentId is the CAIP-10 hash of the signer')) return fail();
        } else if (ev.agentIdScheme === AgentIdScheme.registry) {
            add('agentId', true, 'registry record (scheme 0x01)');
            if (!input.resolveRegistryWallet) warnings.push('scheme 0x01: registry not resolved; agent identity not checked against the registry');
            else {
                const w = await input.resolveRegistryWallet(ev.agentId);
                if (!w || w.toLowerCase() !== d.agent.toLowerCase()) warnings.push(`registry currently binds this agentId to ${w ?? 'no wallet'}, not to the signer (keys may have rotated)`);
            }
        } else { add('agentId', false, `scheme ${ev.agentIdScheme} not allowed for single anchors`); return fail(); }
    }

    if (d.declaredAt > input.blockTimestamp + MAX_FUTURE_SKEW) warnings.push('declared time is after the anchor block');

    if (input.content !== undefined) {
        if (!add('content', sha256(input.content).toLowerCase() === d.contentHash.toLowerCase(), 'SHA-256 of the content equals contentHash')) return fail();
    }

    const when = new Date(Number(input.blockTimestamp) * 1000).toISOString();
    return {
        valid: true, checks, warnings, anchor: ev,
        statement: `The key ${d.agent} signed a declaration that content ${d.contentHash} was generated with the declared model "${d.modelId}", ` +
            `and that declaration existed no later than block ${ev.blockNumber} (${when}) on chain ${domain.chainId}. ` +
            'Model, runtime, process and declared time are the signer\'s claims, not verified facts.',
    };
}

/** Fetch the log and its block from an RPC, then verify. Checks that the RPC is on domain.chainId. */
export async function verifyFromChain(
    client: PublicClient,
    locator: { transactionHash: Hex; logIndex: number },
    rest: Omit<VerifyInput, 'log' | 'blockTimestamp'>,
): Promise<VerifyResult> {
    const chainId = await client.getChainId();
    if (chainId !== rest.domain.chainId) {
        return { valid: false, warnings: [], checks: [{ name: 'chain', ok: false, detail: `RPC is chain ${chainId}, domain is ${rest.domain.chainId}` }] };
    }
    const receipt = await client.getTransactionReceipt({ hash: locator.transactionHash });
    const log = receipt.logs.find((l) => l.logIndex === locator.logIndex);
    if (!log) return { valid: false, warnings: [], checks: [{ name: 'log', ok: false, detail: 'no log at that index' }] };
    if (receipt.status !== 'success') return { valid: false, warnings: [], checks: [{ name: 'tx', ok: false, detail: 'transaction reverted' }] };
    const block = await client.getBlock({ blockNumber: receipt.blockNumber });
    return verifyDeclaration({ ...rest, log, blockTimestamp: block.timestamp });
}
