// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, vi } from 'vitest';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { RxMClient, RxMApiError, buildDeclaration, declarationDigest, recoverDeclarationSigner, metadataHash, sha256, ZERO_HASH, type PoGDeclaration } from '../src/index.js';

const CONTRACT = '0x00000000000000000000000000000000000082a3';
const account = privateKeyToAccount(generatePrivateKey());

function fakeFetch(responses: Array<{ status: number; body: unknown }>) {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const f = vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        const r = responses.shift()!;
        return new Response(JSON.stringify(r.body), { status: r.status });
    });
    return { f: f as unknown as typeof fetch, calls };
}

describe('buildDeclaration', () => {
    it('hashes content and input, random nonce, current time, canonical metadata hash', () => {
        const a = buildDeclaration(account.address, { content: 'out', input: 'in', modelId: 'm:x', runtimeId: 'r/1', metadata: { b: 1, a: 'x' } });
        const b = buildDeclaration(account.address, { content: 'out', modelId: 'm:x', runtimeId: 'r/1' });
        expect(a.contentHash).toBe(sha256('out'));
        expect(a.inputHash).toBe(sha256('in'));
        expect(b.inputHash).toBe(ZERO_HASH);
        expect(a.metadataHash).toBe(metadataHash({ a: 'x', b: 1 }));
        expect(a.nonce).not.toBe(b.nonce);
        expect(Math.abs(Number(a.declaredAt) - Date.now() / 1000)).toBeLessThan(5);
    });
    it('refuses out-of-range input locally', () => {
        expect(() => buildDeclaration(account.address, { content: 'x', modelId: '', runtimeId: 'r' })).toThrow(/modelId/);
    });
});

describe('RxMClient', () => {
    it('declare() posts a declaration signed for the configured chain and contract', async () => {
        const { f, calls } = fakeFetch([{ status: 202, body: { digest: '0x01', state: 'pending' } }]);
        const c = new RxMClient({ apiUrl: 'https://api.example/', chainId: 84532, contract: CONTRACT, fetch: f });
        const r = await c.declare(account, { content: 'hello', modelId: 'm:x', runtimeId: 'r/1', metadata: { tag: 'a' } });
        expect(r.state).toBe('pending');
        expect(calls[0].url).toBe('https://api.example/v2/declarations');
        const slashes = fakeFetch([{ status: 200, body: { digest: '0x01', state: 'pending' } }]);
        await new RxMClient({ apiUrl: 'https://api.example' + '/'.repeat(50_000), chainId: 1, contract: CONTRACT, fetch: slashes.f }).get('0x01');
        expect(slashes.calls[0].url).toBe('https://api.example/v2/declarations/0x01');
        const sent = JSON.parse(String(calls[0].init.body));
        const decl: PoGDeclaration = { ...sent.declaration, declaredAt: BigInt(sent.declaration.declaredAt) };
        const signer = await recoverDeclarationSigner(declarationDigest(c.domain, decl), sent.signature);
        expect(signer).toBe(account.address);
        expect(sent.metadata).toEqual({ tag: 'a' });
    });
    it('turns API errors into RxMApiError with the API code', async () => {
        const { f } = fakeFetch([{ status: 429, body: { error: { code: 'agent_quota_exceeded', message: 'quota' } } }]);
        const c = new RxMClient({ apiUrl: 'https://api.example', chainId: 84532, contract: CONTRACT, fetch: f });
        await expect(c.declare(account, { content: 'x', modelId: 'm:x', runtimeId: 'r' })).rejects.toMatchObject({ status: 429, code: 'agent_quota_exceeded' });
    });
    it('waitForAnchor polls until anchored, and fails on failed or timeout', async () => {
        const ok = fakeFetch([{ status: 200, body: { digest: '0x1', state: 'pending' } }, { status: 200, body: { digest: '0x1', state: 'anchored' } }]);
        const c = new RxMClient({ apiUrl: 'https://a', chainId: 1, contract: CONTRACT, fetch: ok.f });
        expect((await c.waitForAnchor('0x1', { intervalMs: 1 })).state).toBe('anchored');
        const failed = fakeFetch([{ status: 200, body: { digest: '0x1', state: 'failed' } }]);
        await expect(new RxMClient({ apiUrl: 'https://a', chainId: 1, contract: CONTRACT, fetch: failed.f }).waitForAnchor('0x1')).rejects.toBeInstanceOf(RxMApiError);
        const slow = fakeFetch(Array.from({ length: 50 }, () => ({ status: 200, body: { digest: '0x1', state: 'pending' } })));
        await expect(new RxMClient({ apiUrl: 'https://a', chainId: 1, contract: CONTRACT, fetch: slow.f }).waitForAnchor('0x1', { timeoutMs: 5, intervalMs: 2 })).rejects.toMatchObject({ code: 'timeout' });
    });
});
