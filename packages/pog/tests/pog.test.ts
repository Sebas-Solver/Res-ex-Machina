// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { encodeAbiParameters, encodeEventTopics, keccak256, toBytes, type Hex, type Log } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import {
    declarationDigest, signDeclaration, isCanonicalSignature, validateDeclaration, canonicalJson, metadataHash,
    agentIdForKey, caip10, merkleRoot, merkleProof, verifyMerkleProof, verifyDeclaration, sha256, erc8263,
    type PoGDeclaration, type PoGDomain,
} from '../src/index.js';

const V = JSON.parse(readFileSync(new URL('../../../spec/vectors/rxm-pog-v2.json', import.meta.url), 'utf8'));
const domain: PoGDomain = V.domain;
const decl: PoGDeclaration = { ...V.single.declaration, declaredAt: BigInt(V.single.declaration.declaredAt) };
const TEST_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'; // public Hardhat #0
const account = privateKeyToAccount(TEST_KEY);

function makeLog(o: { scheme: number; agentId: Hex; proofHash: Hex; aux: Hex; address?: Hex }): Log {
    const topics = encodeEventTopics({
        abi: erc8263.ERC8263_ABI, eventName: 'AnchorProof',
        args: { agentId: o.agentId, proofHash: o.proofHash, operator: '0x00000000000000000000000000000000000000aa' },
    });
    const data = encodeAbiParameters([{ type: 'uint8' }, { type: 'bytes' }], [o.scheme, o.aux]);
    return {
        address: o.address ?? domain.verifyingContract, topics: topics as [Hex, ...Hex[]], data,
        blockNumber: 100n, logIndex: 0, transactionHash: ('0x' + 'ab'.repeat(32)) as Hex,
        blockHash: ('0x' + 'cd'.repeat(32)) as Hex, transactionIndex: 0, removed: false,
    } as Log;
}
const singleLog = () => makeLog({ scheme: 2, agentId: V.single.agentId, proofHash: V.single.eip712Digest_proofHash, aux: V.single.aux });
const base = () => ({ declaration: decl, signature: V.single.signature as Hex, domain, blockTimestamp: 1790900000n });

describe('vectors', () => {
    it('reproduce digest, signature, aux, agentId and selectors', async () => {
        expect(declarationDigest(domain, decl)).toBe(V.single.eip712Digest_proofHash);
        expect(await signDeclaration(account, domain, decl)).toBe(V.single.signature);
        expect(erc8263.encodeSingleAux(V.single.signature)).toBe(V.single.aux);
        expect(agentIdForKey(domain.chainId, decl.agent)).toBe(V.single.agentId);
        expect(caip10(domain.chainId, decl.agent)).toBe(V.single.caip10);
        expect(erc8263.SELECTOR_SINGLE).toBe(V.selectors.single);
        expect(erc8263.SELECTOR_BATCH).toBe(V.selectors.batch);
        expect(erc8263.ERC8263_TOPIC0).toBe(V.erc8263_topic0);
        expect(metadataHash(JSON.parse(V.single.metadataJcs))).toBe(decl.metadataHash);
        expect(sha256(V.single.content)).toBe(decl.contentHash);
        expect(merkleRoot(V.batch.leaves_eip712Digests)).toBe(V.batch.merkleRoot_proofHash);
    });
});

describe('verifyDeclaration: single anchor', () => {
    it('accepts the vector and states only what it proves', async () => {
        const r = await verifyDeclaration({ ...base(), log: singleLog(), content: V.single.content });
        expect(r.valid).toBe(true);
        expect(r.warnings).toEqual([]);
        expect(r.statement).toContain('existed no later than block 100');
        expect(r.statement).toContain('not verified facts');
    });
    it('rejects a tampered declared field', async () => {
        const r = await verifyDeclaration({ ...base(), declaration: { ...decl, modelId: 'other:model' }, log: singleLog() });
        expect(r.valid).toBe(false);
        expect(r.checks.at(-1)?.name).toBe('proofHash');
    });
    it('rejects an anchor emitted by another contract', async () => {
        const log = makeLog({ scheme: 2, agentId: V.single.agentId, proofHash: V.single.eip712Digest_proofHash, aux: V.single.aux, address: '0x00000000000000000000000000000000000000bb' });
        expect((await verifyDeclaration({ ...base(), log })).checks.at(-1)?.name).toBe('contract');
    });
    it('rejects a declaration signed by a different key', async () => {
        const other = privateKeyToAccount(generatePrivateKey());
        const forged = { ...decl, agent: other.address };
        const sig = await signDeclaration(other, domain, forged);
        const digest = declarationDigest(domain, forged);
        // The forger anchors under the victim's agentId: must fail on agentId.
        const log = makeLog({ scheme: 2, agentId: V.single.agentId, proofHash: digest, aux: erc8263.encodeSingleAux(sig) });
        const r = await verifyDeclaration({ ...base(), declaration: forged, signature: sig, log });
        expect(r.valid).toBe(false);
        expect(r.checks.at(-1)?.name).toBe('agentId');
    });
    it('rejects a high-s signature', async () => {
        const sig = V.single.signature as Hex;
        const n = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
        const s = BigInt('0x' + sig.slice(66, 130));
        const v = parseInt(sig.slice(130), 16) === 27 ? '1c' : '1b';
        const high = (sig.slice(0, 66) + (n - s).toString(16).padStart(64, '0') + v) as Hex;
        expect(isCanonicalSignature(high)).toBe(false);
        const log = makeLog({ scheme: 2, agentId: V.single.agentId, proofHash: V.single.eip712Digest_proofHash, aux: erc8263.encodeSingleAux(high) });
        const r = await verifyDeclaration({ ...base(), signature: high, log });
        expect(r.valid).toBe(false);
        expect(r.checks.at(-1)?.name).toBe('signer');
    });
    it('rejects a signature that differs from the anchored one', async () => {
        const other = await privateKeyToAccount(generatePrivateKey()).signMessage({ message: 'x' });
        const r = await verifyDeclaration({ ...base(), signature: other, log: singleLog() });
        expect(r.checks.at(-1)?.name).toBe('signature-in-anchor');
    });
    it('rejects aux that is not an rxm-pog-v2 payload', async () => {
        const log = makeLog({ scheme: 2, agentId: V.single.agentId, proofHash: V.single.eip712Digest_proofHash, aux: '0xdeadbeef' });
        expect((await verifyDeclaration({ ...base(), log })).checks.at(-1)?.name).toBe('aux');
    });
    it('rejects content that does not match', async () => {
        const r = await verifyDeclaration({ ...base(), log: singleLog(), content: 'edited' });
        expect(r.checks.at(-1)?.name).toBe('content');
    });
    it('warns when the declared time is after the anchor', async () => {
        const r = await verifyDeclaration({ ...base(), log: singleLog(), blockTimestamp: 1790000000n });
        expect(r.valid).toBe(true);
        expect(r.warnings[0]).toMatch(/after the anchor/);
    });
    it('scheme 0x01 reports a registry mismatch as a warning', async () => {
        const agentId = ('0x' + '0'.repeat(63) + '7') as Hex;
        const log = makeLog({ scheme: 1, agentId, proofHash: V.single.eip712Digest_proofHash, aux: V.single.aux });
        const r = await verifyDeclaration({ ...base(), log, resolveRegistryWallet: async () => '0x00000000000000000000000000000000000000cc' });
        expect(r.valid).toBe(true);
        expect(r.warnings[0]).toMatch(/registry currently binds/);
    });
});

describe('verifyDeclaration: batch anchor', () => {
    it('accepts a member with its proof and rejects without it', async () => {
        const digests: Hex[] = V.batch.leaves_eip712Digests;
        const log = makeLog({ scheme: 0, agentId: V.batch.agentId, proofHash: V.batch.merkleRoot_proofHash, aux: erc8263.encodeBatchAux(keccak256(toBytes('bundle'))) });
        const ok = await verifyDeclaration({ ...base(), log, merkleProof: merkleProof(digests, 0) });
        expect(ok.valid).toBe(true);
        expect((await verifyDeclaration({ ...base(), log })).valid).toBe(false);
    });
});

describe('merkle', () => {
    it('proofs verify for every index of odd and even trees', () => {
        for (const n of [1, 2, 3, 5, 8]) {
            const ds = Array.from({ length: n }, (_, i) => keccak256(toBytes(`leaf ${i}`)));
            const root = merkleRoot(ds);
            ds.forEach((d, i) => expect(verifyMerkleProof(d, merkleProof(ds, i), root)).toBe(true));
            expect(verifyMerkleProof(keccak256(toBytes('outsider')), merkleProof(ds, 0), root)).toBe(false);
        }
    });
});

describe('validateDeclaration and canonical JSON', () => {
    it('flags out-of-range and malformed fields', () => {
        const bad = { ...decl, processType: 4, humanIntervention: 6, pipelineSteps: 0, modelId: '', nonce: ('0x' + '0'.repeat(64)) as Hex };
        const errs = validateDeclaration(bad);
        expect(errs.join(' ')).toMatch(/processType/);
        expect(errs.join(' ')).toMatch(/humanIntervention/);
        expect(errs.join(' ')).toMatch(/pipelineSteps/);
        expect(errs.join(' ')).toMatch(/modelId/);
        expect(errs.join(' ')).toMatch(/nonce/);
        expect(validateDeclaration(decl)).toEqual([]);
    });
    it('sorts keys and drops whitespace (RFC 8785)', () => {
        expect(canonicalJson({ b: [3, 1.5, 'é'], a: { d: null, c: true } })).toBe('{"a":{"c":true,"d":null},"b":[3,1.5,"é"]}');
        expect(metadataHash({})).toBe('0x' + '0'.repeat(64));
    });
});
