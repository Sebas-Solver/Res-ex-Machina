/**
 * smoke-test-remaining.ts
 * 
 * Prueba los 5 endpoints que NO cubre el smoke test original:
 *   7.  GET  /v1/records/:id          — Obtener record por ID
 *   8.  GET  /v1/records/mine         — Listar mis records (walletAuth)
 *   9.  POST /v1/webhooks             — Crear webhook (walletAuth)
 *  10.  GET  /v1/webhooks             — Listar webhooks (walletAuth)
 *  11.  DELETE /v1/webhooks/:id       — Eliminar webhook (walletAuth)
 *
 * Usa un record ya existente del smoke test anterior.
 * Requiere: TEST_AGENT_PRIVATE_KEY en .env
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
    console.error('❌ Falta TEST_AGENT_PRIVATE_KEY en .env');
    process.exit(1);
}

const account = privateKeyToAccount(PRIVATE_KEY);
const WALLET = account.address;

// Record existente del smoke test anterior
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
        console.log(`  ✅ Paso ${step}: ${name} (${ms}ms) — ${detail}`);
        return true;
    } catch (err: any) {
        const ms = Date.now() - t0;
        const error = err.message ?? String(err);
        results.push({ step, name, ok: false, ms, error });
        console.log(`  ❌ Paso ${step}: ${name} (${ms}ms) — ${error}`);
        return false;
    }
}

// =============================================
// Tests
// =============================================

async function main() {
    console.log('\n🔬 SMOKE TEST — Endpoints restantes (5 tests)\n');
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

        // Validaciones
        if (data.record_id !== EXISTING_RECORD_ID) throw new Error('record_id no coincide');
        if (!data.content_hash?.startsWith('sha256:')) throw new Error('Falta content_hash');
        if (data.state !== 'anchored') throw new Error(`state: ${data.state} (esperado: anchored)`);
        if (!data.pog_bundle?.signature) throw new Error('Falta pog_bundle.signature');
        if (!data.fee?.tx_hash) throw new Error('Falta fee.tx_hash');
        if (!data.anchor?.tx_hash) throw new Error('Falta anchor.tx_hash');
        if (!data.links?.self) throw new Error('Falta links.self');

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

        // Puede devolver records[] o un wrapper con data[]
        const records = data.records ?? data.data ?? data;
        if (!Array.isArray(records)) throw new Error('Respuesta no es array');
        if (records.length === 0) throw new Error('No se encontraron records para esta wallet');

        // Verificar que el record del smoke test está en la lista
        const found = records.some((r: any) => r.record_id === EXISTING_RECORD_ID);
        if (!found) throw new Error(`Record ${EXISTING_RECORD_ID} no aparece en /mine`);

        return `${records.length} record(s), incluye record del smoke test`;
    });

    // ─── Step 9: POST /v1/webhooks ───
    await runStep(9, 'POST /webhooks (crear)', async () => {
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

        if (!data.webhook_id) throw new Error('Falta webhook_id');
        if (!data.secret) throw new Error('Falta secret (debería mostrarse solo una vez)');
        if (!data.url) throw new Error('Falta url');
        if (data.active !== true) throw new Error(`active=${data.active} (esperado: true)`);

        webhookId = data.webhook_id;
        return `webhook_id=${webhookId}, secret=${data.secret.slice(0, 8)}…`;
    });

    // ─── Step 10: GET /v1/webhooks ───
    await runStep(10, 'GET /webhooks (listar)', async () => {
        const headers = await getAuthHeaders();
        const res = await fetch(`${API}/v1/webhooks`, { headers });
        if (!res.ok) {
            const body = await res.text();
            throw new Error(`HTTP ${res.status}: ${body}`);
        }
        const data = await res.json() as any;

        if (!data.webhooks || !Array.isArray(data.webhooks)) throw new Error('Falta array webhooks');
        if (data.total < 1) throw new Error('total < 1 — debería haber al menos 1');

        // Verificar que el webhook creado aparece
        const found = data.webhooks.some((w: any) => w.webhook_id === webhookId);
        if (webhookId && !found) throw new Error(`Webhook ${webhookId} no aparece en la lista`);

        // Verificar que no se devuelve el secret
        const leakedSecret = data.webhooks.some((w: any) => w.secret);
        if (leakedSecret) throw new Error('⚠️ SEGURIDAD: el secret se muestra en GET (no debería)');

        return `${data.total} webhook(s), sin secret expuesto ✔`;
    });

    // ─── Step 11: DELETE /v1/webhooks/:id ───
    await runStep(11, 'DELETE /webhooks/:id (eliminar)', async () => {
        if (!webhookId) throw new Error('No hay webhook_id (paso 9 falló)');

        const headers = await getAuthHeaders();
        // DELETE no tiene body → quitar Content-Type para evitar error de Fastify
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

        if (data.deleted !== true) throw new Error(`deleted=${data.deleted} (esperado: true)`);
        if (data.webhook_id !== webhookId) throw new Error('webhook_id no coincide');

        // Verificar que ya no aparece como activo
        const headers2 = await getAuthHeaders();
        const res2 = await fetch(`${API}/v1/webhooks`, { headers: headers2 });
        const data2 = await res2.json() as any;
        const stillActive = (data2.webhooks ?? []).some(
            (w: any) => w.webhook_id === webhookId && w.active === true
        );
        if (stillActive) throw new Error('Webhook sigue activo después de DELETE');

        return `webhook ${webhookId} eliminado y verificado`;
    });

    // =============================================
    // Resumen
    // =============================================

    const passed = results.filter((r) => r.ok).length;
    const total = results.length;
    const totalMs = results.reduce((s, r) => s + r.ms, 0);

    console.log('\n' + '═'.repeat(55));
    if (passed === total) {
        console.log(`  🎉 TODOS ${passed}/${total} PASOS PASADOS  (~${(totalMs / 1000).toFixed(1)}s)`);
    } else {
        console.log(`  ⚠️  ${passed}/${total} PASOS OK — ${total - passed} FALLIDOS`);
        results.filter((r) => !r.ok).forEach((r) => {
            console.log(`     ❌ Paso ${r.step}: ${r.error}`);
        });
    }
    console.log('═'.repeat(55) + '\n');

    process.exit(passed === total ? 0 : 1);
}

main().catch((err) => {
    console.error('💥 Error fatal:', err);
    process.exit(1);
});
