// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { pogDomain, signDeclaration } from '@res-ex-machina/pog';
import { acceptDeclaration } from '../../src/v2/accept.js';
import { ApiError } from '../../src/utils/errors.js';
import { createTestDb, cfg, signed, CONTRACT } from './helpers.js';
import type { Db } from '../../src/v2/store.js';

vi.mock('../../src/config/monitoring.js', () => ({ Sentry: { captureException: vi.fn() }, initMonitoring: vi.fn() }));

let t: { db: Db; close: () => Promise<void> };
const enqueue = vi.fn(async () => {});
beforeEach(async () => { t = await createTestDb(); enqueue.mockClear(); });
afterEach(async () => { await t.close(); });

const code = async (p: Promise<unknown>) => { try { await p; return 'ok'; } catch (e) { return (e as ApiError).code; } };

describe('acceptDeclaration', () => {
    it('accepts a valid declaration, stores it lowercase and enqueues it once', async () => {
        const s = await signed();
        const r = await acceptDeclaration(cfg(), { db: t.db, enqueue }, s.body);
        expect(r.status).toBe(202);
        expect(r.row.agent).toBe(s.account.address.toLowerCase());
        expect(r.row.state).toBe('pending');
        expect(enqueue).toHaveBeenCalledTimes(1);
    });

    it('re-submitting the same declaration is idempotent (200, no second enqueue)', async () => {
        const s = await signed();
        await acceptDeclaration(cfg(), { db: t.db, enqueue }, s.body);
        const again = await acceptDeclaration(cfg(), { db: t.db, enqueue }, s.body);
        expect(again.status).toBe(200);
        expect(enqueue).toHaveBeenCalledTimes(1);
    });

    it('two agents may declare the same content (no global content_hash lock, A-01)', async () => {
        const a = await signed();
        const b = await signed(undefined, { contentHash: a.declaration.contentHash });
        expect((await acceptDeclaration(cfg(), { db: t.db, enqueue }, a.body)).status).toBe(202);
        expect((await acceptDeclaration(cfg(), { db: t.db, enqueue }, b.body)).status).toBe(202);
    });

    it('rejects a reused nonce with different content (409)', async () => {
        const a = await signed();
        const b = await signed(a.account, { nonce: a.declaration.nonce });
        await acceptDeclaration(cfg(), { db: t.db, enqueue }, a.body);
        expect(await code(acceptDeclaration(cfg(), { db: t.db, enqueue }, b.body))).toBe('nonce_reused');
    });

    it('rejects a declaration claiming another agent (signature by a different key)', async () => {
        const victim = privateKeyToAccount(generatePrivateKey());
        const forger = privateKeyToAccount(generatePrivateKey());
        const s = await signed(forger);
        const body = { ...s.body, declaration: { ...s.body.declaration, agent: victim.address } };
        expect(await code(acceptDeclaration(cfg(), { db: t.db, enqueue }, body))).toBe('signature_mismatch');
    });

    it('rejects a tampered field after signing', async () => {
        const s = await signed();
        const body = { ...s.body, declaration: { ...s.body.declaration, modelId: 'other:model' } };
        expect(await code(acceptDeclaration(cfg(), { db: t.db, enqueue }, body))).toBe('signature_mismatch');
    });

    it('rejects a signature made for another chain or contract', async () => {
        const s = await signed();
        const sig = await signDeclaration(s.account, pogDomain(8453, CONTRACT), s.declaration);
        expect(await code(acceptDeclaration(cfg(), { db: t.db, enqueue }, { ...s.body, signature: sig }))).toBe('signature_mismatch');
    });

    it('rejects a high-s signature', async () => {
        const s = await signed();
        const n = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
        const sv = BigInt('0x' + s.signature.slice(66, 130));
        const v = parseInt(s.signature.slice(130), 16) === 27 ? '1c' : '1b';
        const high = s.signature.slice(0, 66) + (n - sv).toString(16).padStart(64, '0') + v;
        expect(await code(acceptDeclaration(cfg(), { db: t.db, enqueue }, { ...s.body, signature: high }))).toBe('invalid_signature');
    });

    it('rejects metadata whose canonical hash differs from metadataHash', async () => {
        const s = await signed(undefined, {}, { tag: 'a' });
        expect(await code(acceptDeclaration(cfg(), { db: t.db, enqueue }, { ...s.body, metadata: { tag: 'b' } }))).toBe('metadata_mismatch');
        expect((await acceptDeclaration(cfg(), { db: t.db, enqueue }, s.body)).status).toBe(202);
    });

    it('rejects out-of-range fields and unknown keys before any signature work', async () => {
        const s = await signed();
        expect(await code(acceptDeclaration(cfg(), { db: t.db, enqueue }, { ...s.body, declaration: { ...s.body.declaration, humanIntervention: 9 } }))).toBe('invalid_declaration');
        expect(await code(acceptDeclaration(cfg(), { db: t.db, enqueue }, { ...s.body, extra: 1 }))).toBe('invalid_payload');
    });

    it('rejects a declaredAt far in the future', async () => {
        const s = await signed(undefined, { declaredAt: BigInt(Math.floor(Date.now() / 1000) + 3600) });
        expect(await code(acceptDeclaration(cfg(), { db: t.db, enqueue }, s.body))).toBe('declared_in_future');
    });

    it('enforces the per-agent and global quotas', async () => {
        const account = privateKeyToAccount(generatePrivateKey());
        for (let i = 0; i < 2; i++) await acceptDeclaration(cfg({ agentDailyQuota: 2 }), { db: t.db, enqueue }, (await signed(account)).body);
        expect(await code(acceptDeclaration(cfg({ agentDailyQuota: 2 }), { db: t.db, enqueue }, (await signed(account)).body))).toBe('agent_quota_exceeded');
        expect(await code(acceptDeclaration(cfg({ globalDailyQuota: 2 }), { db: t.db, enqueue }, (await signed()).body))).toBe('global_quota_exceeded');
    });

    it('kill switch: disabled service accepts nothing (503)', async () => {
        const s = await signed();
        expect(await code(acceptDeclaration(cfg({ enabled: false }), { db: t.db, enqueue }, s.body))).toBe('v2_disabled');
        expect(enqueue).not.toHaveBeenCalled();
    });
});
