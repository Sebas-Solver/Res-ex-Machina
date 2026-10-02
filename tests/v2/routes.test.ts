// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { apiErrorHandler } from '../../src/utils/errors.js';
import v2Routes from '../../src/routes/v2.js';
import { createTestDb, cfg, signed } from './helpers.js';
import type { Db } from '../../src/v2/store.js';

vi.mock('../../src/config/monitoring.js', () => ({ Sentry: { captureException: vi.fn() }, initMonitoring: vi.fn() }));

let t: { db: Db; close: () => Promise<void> };
let app: FastifyInstance;
beforeEach(async () => {
    t = await createTestDb();
    app = Fastify();
    app.setErrorHandler(apiErrorHandler);
    await app.register(v2Routes, { prefix: '/v2', config: cfg(), deps: { db: t.db, enqueue: async () => {} } });
});
afterEach(async () => { await app.close(); await t.close(); });

describe('/v2/declarations', () => {
    it('POST returns 202 with a self-contained receipt; GET by digest returns it', async () => {
        const s = await signed();
        const post = await app.inject({ method: 'POST', url: '/v2/declarations', payload: s.body });
        expect(post.statusCode).toBe(202);
        const r = post.json();
        expect(r.profile).toBe('rxm-pog-v2');
        expect(r.domain).toEqual({ name: 'ResExMachina PoG', version: '2', chainId: 84532, verifyingContract: '0x00000000000000000000000000000000000082a3' });
        expect(r.anchor).toBeNull();
        expect(r.statement).toBeUndefined();
        const get = await app.inject({ method: 'GET', url: `/v2/declarations/${r.digest}` });
        expect(get.statusCode).toBe(200);
        expect(get.json().signature).toBe(s.signature.toLowerCase());
    });

    it('maps errors to status codes', async () => {
        expect((await app.inject({ method: 'POST', url: '/v2/declarations', payload: { nope: 1 } })).statusCode).toBe(400);
        expect((await app.inject({ method: 'GET', url: '/v2/declarations/xyz' })).statusCode).toBe(400);
        expect((await app.inject({ method: 'GET', url: `/v2/declarations/0x${'ab'.repeat(32)}` })).statusCode).toBe(404);
    });

    it('there is no public listing by agent (INV-021)', async () => {
        expect((await app.inject({ method: 'GET', url: '/v2/declarations?agent=0x0000000000000000000000000000000000000001' })).statusCode).toBe(404);
    });
});
