// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseArgs, formatResult } from '../src/cli.js';
import { parseReceipt, verifyReceipt } from '../src/receipt.js';

const V = JSON.parse(readFileSync(new URL('../../../spec/vectors/rxm-pog-v2.json', import.meta.url), 'utf8'));
const receipt = {
    profile: 'rxm-pog-v2', state: 'anchored',
    declaration: V.single.declaration, signature: V.single.signature,
    domain: V.domain,
    anchor: { transactionHash: '0x' + 'ab'.repeat(32), logIndex: 0 },
    statement: 'anything the server says is ignored',
};

describe('rxm-verify CLI', () => {
    it('parses arguments', () => {
        expect(parseArgs(['r.json', '--content', 'c.txt', '--rpc', 'http://x', '--json'])).toEqual({ source: 'r.json', content: 'c.txt', rpc: 'http://x', json: true });
        expect(() => parseArgs([])).toThrow(/usage/);
        expect(() => parseArgs(['a', 'b'])).toThrow(/unexpected/);
        expect(() => parseArgs(['a', '--bogus'])).toThrow(/unknown option/);
        expect(() => parseArgs(['a', '--rpc'])).toThrow(/need a value/);
    });
    it('formats a result with PASS/FAIL lines and the verdict', () => {
        const out = formatResult({ valid: false, warnings: ['w'], checks: [{ name: 'event', ok: true, detail: 'ok' }, { name: 'signer', ok: false, detail: 'bad' }] });
        expect(out).toMatch(/PASS\s+event/);
        expect(out).toMatch(/FAIL\s+signer/);
        expect(out).toMatch(/WARN\s+w/);
        expect(out.trim().endsWith('NOT VALID')).toBe(true);
    });
});

describe('receipts', () => {
    it('parses the API receipt shape and converts declaredAt to bigint', () => {
        const p = parseReceipt(receipt);
        expect(p.declaration.declaredAt).toBe(BigInt(V.single.declaration.declaredAt));
        expect(p.locator).toEqual(receipt.anchor);
    });
    it('rejects foreign documents', () => {
        expect(() => parseReceipt({ profile: 'pog.v1' })).toThrow(/profile/);
        expect(() => parseReceipt({ ...receipt, domain: { ...V.domain, version: '1' } })).toThrow(/domain/);
    });
    it('an unanchored receipt is not valid, whatever its fields say', async () => {
        const r = await verifyReceipt({ ...receipt, anchor: null });
        expect(r.valid).toBe(false);
        expect(r.checks[0].name).toBe('anchor');
    });
    it('refuses to guess an RPC for an unknown chain', async () => {
        await expect(verifyReceipt({ ...receipt, domain: { ...V.domain, chainId: 999999 } })).rejects.toThrow(/no RPC/);
    });
});
