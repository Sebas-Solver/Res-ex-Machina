// SPDX-License-Identifier: Apache-2.0

/**
 * smoke-test-remaining.ts
 * 
 * Tests the 5 endpoints NOT covered by the original smoke test:
 *   7.  GET  /v1/records/:id          — Get record by ID
 *   8.  GET  /v1/records/mine         — List my records (walletAuth)
 *   9.  POST /v1/webhooks             — Create webhook (walletAuth)
 *  10.  GET  /v1/webhooks             — List webhooks (walletAuth)
 *  11.  DELETE /v1/webhooks/:id       — Delete webhook (walletAuth)
 *
 * Uses an existing record from the previous smoke test.
 * Requires: TEST_AGENT_PRIVATE_KEY in .env
 */

import 'dotenv/config';
import { createWalletClient, http, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

// =============================================
// Config
// =============================================

const API = 'https://res-ex-machina-api.onrender.com';
const PRIVATE_KEY = process.env.TEST_AGENT_PRIVATE_KEY as Hex;

if (!PRIVATE_KEY) {
    console.error('❌ Missing TEST_AGENT_PRIVATE_KEY in .env');
    process.exit(1);
}

const account = privateKeyToAccount(PRIVATE_KEY);
const WALLET = account.address;

// Existing record from the previous smoke test
const EXISTING_RECORD_ID = '019c685a-2466-7913-9416-dd296c50b5cc';

// =============================================
// Helpers
// =============================================

async function getAuthHeaders(): Promise<Record<string, string>> {
    const timestamp = new Date().toISOString();
    const message = `RexAuth:${timestamp}`;
    const signature = await account.signMessage({ message });

    return {
        'X-Wallet-Address': WALLET,
        'X-Signature': signature,
        'X-Timestamp': timestamp,
        'Content-Type': 'application/json',
    };
}

interface StepResult {
    step: number;
    name: string;
    ok: boolean;
    ms: number;
    detail?: string;
    error?: string;
}

const results: StepResult[] = [];

async function runStep(
    step: number,
    name: string,
    fn: () => Promise<string>,
): Promise<boolean> {
    const t0 = Date.now();
    try {
        const detail = await fn();
        const ms = Date.now() - t0;
        results.push({ step, name, ok: true, ms, detail });
        console.log(`  ✅ Step ${step}: ${name} (${ms}ms) — ${detail}`);
        return true;
    } catch (err: any) {
        const ms = Date.now() - t0;
        const error = err.message ?? String(err);
        results.push({ step, name, ok: false, ms, error });
        console.log(`  ❌ Step ${step}: ${name} (${ms}ms) — ${error}`);
        return false;
    }
}

// =============================================
// Tests
// =============================================

async function main() {
    console.log('\n🔬 SMOKE TEST — Remaining endpoints (5 tests)\n');
    console.log(`  API:    ${API}`);
    console.log(`  Wallet: ${WALLET}`);
    console.log(`  Record: ${EXISTING_RECORD_ID}\n`);

    let webhookId: string | null = null;

    // ─── Step 7: GET /v1/records/:id ───
    await runStep(7, 'GET record by ID', async () => {
        const res = await fetch(`${API}/v1/records/${EXISTING_RECORD_ID}`);
        if (!res.ok) {
            const body = await res.text();
            throw new Error(`HTTP ${res.status}: ${body}`);
        }
        const data = await res.json() as any;

        // Validations
        if (data.record_id !== EXISTING_RECORD_ID) throw new Error('record_id mismatch');
        if (!data.content_hash?.startsWith('sha256:')) throw new Error('Missing content_hash');
        if (data.state !== 'anchored') throw new Error(`state: ${data.state} (expected: anchored)`);
        if (!data.pog_bundle?.signature) throw new Error('Missing pog_bundle.signature');
        if (!data.fee?.tx_hash) throw new Error('Missing fee.tx_hash');
        if (!data.anchor?.tx_hash) throw new Error('Missing anchor.tx_hash');
        if (!data.links?.self) throw new Error('Missing links.self');

        return `state=${data.state}, anchor_block=${data.anchor.block}`;
    });

    // ─── Step 8: GET /v1/records/mine ───
    await runStep(8, 'GET /records/mine (walletAuth)', async () => {
        const headers = await getAuthHeaders();
        const res = await fetch(`${API}/v1/records/mine`, { headers });
        if (!res.ok) {
            const body = await res.text();
            throw new Error(`HTTP ${res.status}: ${body}`);
        }
        const data = await res.json() as any;

        // Can return records[] or a wrapper with data[]
        const records = data.records ?? data.data ?? data;
        if (!Array.isArray(records)) throw new Error('Response is not an array');
        if (records.length === 0) throw new Error('No records found for this wallet');

        // Verify the smoke test record is in the list
        const found = records.some((r: any) => r.record_id === EXISTING_RECORD_ID);
        if (!found) throw new Error(`Record ${EXISTING_RECORD_ID} not found in /mine`);

        return `${records.length} record(s), includes smoke test record`;
    });

    // ─── Step 9: POST /v1/webhooks ───
    await runStep(9, 'POST /webhooks (create)', async () => {
        const headers = await getAuthHeaders();
        const res = await fetch(`${API}/v1/webhooks`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                url: 'https://example.com/webhook-test',
                events: ['state_changed'],
            }),
        });
        if (!res.ok) {
            const body = await res.text();
            throw new Error(`HTTP ${res.status}: ${body}`);
        }
        const data = await res.json() as any;

        if (!data.webhook_id) throw new Error('Missing webhook_id');
        if (!data.secret) throw new Error('Missing secret (should be shown only once)');
        if (!data.url) throw new Error('Missing url');
        if (data.active !== true) throw new Error(`active=${data.active} (expected: true)`);

        webhookId = data.webhook_id;
        return `webhook_id=${webhookId}, secret=${data.secret.slice(0, 8)}…`;
    });

    // ─── Step 10: GET /v1/webhooks ───
    await runStep(10, 'GET /webhooks (list)', async () => {
        const headers = await getAuthHeaders();
        const res = await fetch(`${API}/v1/webhooks`, { headers });
        if (!res.ok) {
            const body = await res.text();
            throw new Error(`HTTP ${res.status}: ${body}`);
        }
        const data = await res.json() as any;

        if (!data.webhooks || !Array.isArray(data.webhooks)) throw new Error('Missing webhooks array');
        if (data.total < 1) throw new Error('total < 1 — should have at least 1');

        // Verify the created webhook appears
        const found = data.webhooks.some((w: any) => w.webhook_id === webhookId);
        if (webhookId && !found) throw new Error(`Webhook ${webhookId} not found in the list`);

        // Verify the secret is not returned
        const leakedSecret = data.webhooks.some((w: any) => w.secret);
        if (leakedSecret) throw new Error('⚠️ SECURITY: secret is shown in GET (should not be)');

        return `${data.total} webhook(s), no secret exposed ✔`;
    });

    // ─── Step 11: DELETE /v1/webhooks/:id ───
    await runStep(11, 'DELETE /webhooks/:id (delete)', async () => {
        if (!webhookId) throw new Error('No webhook_id (step 9 failed)');

        const headers = await getAuthHeaders();
        // DELETE has no body → remove Content-Type to avoid Fastify error
        delete headers['Content-Type'];
        const res = await fetch(`${API}/v1/webhooks/${webhookId}`, {
            method: 'DELETE',
            headers,
        });
        if (!res.ok) {
            const body = await res.text();
            throw new Error(`HTTP ${res.status}: ${body}`);
        }
        const data = await res.json() as any;

        if (data.deleted !== true) throw new Error(`deleted=${data.deleted} (expected: true)`);
        if (data.webhook_id !== webhookId) throw new Error('webhook_id mismatch');

        // Verify it no longer appears as active
        const headers2 = await getAuthHeaders();
        const res2 = await fetch(`${API}/v1/webhooks`, { headers: headers2 });
        const data2 = await res2.json() as any;
        const stillActive = (data2.webhooks ?? []).some(
            (w: any) => w.webhook_id === webhookId && w.active === true
        );
        if (stillActive) throw new Error('Webhook still active after DELETE');

        return `webhook ${webhookId} deleted and verified`;
    });

    // =============================================
    // Summary
    // =============================================

    const passed = results.filter((r) => r.ok).length;
    const total = results.length;
    const totalMs = results.reduce((s, r) => s + r.ms, 0);

    console.log('\n' + '═'.repeat(55));
    if (passed === total) {
        console.log(`  🎉 ALL ${passed}/${total} STEPS PASSED  (~${(totalMs / 1000).toFixed(1)}s)`);
    } else {
        console.log(`  ⚠️  ${passed}/${total} STEPS OK — ${total - passed} FAILED`);
        results.filter((r) => !r.ok).forEach((r) => {
            console.log(`     ❌ Step ${r.step}: ${r.error}`);
        });
    }
    console.log('═'.repeat(55) + '\n');

    process.exit(passed === total ? 0 : 1);
}

main().catch((err) => {
    console.error('💥 Fatal error:', err);
    process.exit(1);
});
