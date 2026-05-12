// SPDX-License-Identifier: Apache-2.0

/**
 * Regression test: Rate Limit returns 429 (not 500).
 *
 * Este test verifica que cuando se excede el rate limit de POST /v1/records,
 * la API devuelve:
 *   - Status code: 429 (no 500)
 *   - Body: { error: { code: "rate_limit_exceeded", message: "..." } }
 *   - Headers: x-ratelimit-limit, x-ratelimit-remaining, x-ratelimit-reset
 *
 * Bug original: el apiErrorHandler no manejaba el statusCode 429 del plugin
 * @fastify/rate-limit, and fell to the generic catch-all returning 500.
 *
 * Ejecutar:
 *   npx tsx scripts/tests/rate-limit-regression.ts
 *
 * Requisitos:
 *   - API corriendo en localhost:3000
 *   - Docker services (Postgres, Redis, Anvil) activos
 */

const API_URL = process.env.API_URL ?? 'http://localhost:3000';

interface TestResult {
    name: string;
    passed: boolean;
    detail: string;
}

const results: TestResult[] = [];

function assert(name: string, condition: boolean, detail: string) {
    results.push({ name, passed: condition, detail });
    const icon = condition ? '✅' : '❌';
    console.log(`  ${icon} ${name}: ${detail}`);
}

/**
 * Sends a minimal POST to /v1/records.
 * Does not need to be valid — just needs to pass the body parser so that
 * the rate limit counts it. A minimal body (without valid signature) will be rejected
 * con 400/401, pero el rate limiter lo cuenta igualmente.
 */
async function sendRequest(): Promise<Response> {
    return fetch(`${API_URL}/v1/records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            pog_bundle: {
                schema: 'pog.v1',
                content_hash: `sha256:${'a'.repeat(64)}`,
                agent_wallet: '0x0000000000000000000000000000000000000000',
                model_id: 'test',
                runtime_id: 'test',
                generation_process: {
                    process_type: 'direct',
                    human_intervention_level: 0,
                    pipeline_steps: 1,
                },
                timestamp: new Date().toISOString(),
                nonce: `test-${Date.now()}`,
                signature: '0x' + 'ab'.repeat(65),
            },
            content_type: 'text/plain',
            visibility: 'proof_only',
            fee_amount: 0.01,
            fee_currency: 'ETH',
            fee_tx_hash: '0x' + '00'.repeat(32),
        }),
    });
}

async function main() {
    console.log('\n🛡️  Regression test: Rate Limit 429\n');
    console.log(`   API: ${API_URL}`);
    console.log(`   Limit POST /v1/records: 10 req/min per wallet\n`);

    // El rate limit de la ruta POST /v1/records es 10/min por wallet.
    // We send 15 rapid requests to exceed the limit.
    // The first ~10 will be 400/401 (invalid body) but will count toward the rate limit.
    // The last ones should return 429.

    console.log('  Sending 15 rapid requests to exceed rate limit...\n');

    const responses: { status: number; body: string; headers: Headers }[] = [];

    for (let i = 0; i < 15; i++) {
        const res = await sendRequest();
        const body = await res.text();
        responses.push({ status: res.status, body, headers: res.headers });

        // Log resumido
        const statusIcon = res.status === 429 ? '🚫' : res.status < 500 ? '·' : '💥';
        if (res.status === 429 || res.status >= 500) {
            console.log(`  ${statusIcon} [${i + 1}/15] Status ${res.status}`);
        }
    }

    console.log('');

    // --- Verificaciones ---

    // 1. Al menos una respuesta fue 429
    const got429 = responses.some(r => r.status === 429);
    assert(
        'Rate limit devuelve 429',
        got429,
        got429 ? 'At least one 429 received' : 'NO response was 429',
    );

    // 2. NEVER returned 500
    const got500 = responses.some(r => r.status === 500);
    assert(
        'NUNCA devuelve 500 por rate limit',
        !got500,
        got500 ? `GOT 500 — BUG PRESENT` : 'No 500 detected',
    );

    // 3. Body del 429 tiene el formato correcto
    const first429 = responses.find(r => r.status === 429);
    if (first429) {
        try {
            const body = JSON.parse(first429.body);
            const hasCode = body?.error?.code === 'rate_limit_exceeded';
            const hasMessage = typeof body?.error?.message === 'string' && body.error.message.length > 0;

            assert(
                'Body 429 tiene code: rate_limit_exceeded',
                hasCode,
                hasCode ? `code: "${body.error.code}"` : `code inesperado: "${body?.error?.code}"`,
            );

            assert(
                'Body 429 has message (non-empty string)',
                hasMessage,
                hasMessage ? `message: "${body.error.message}"` : 'message missing or empty',
            );
        } catch {
            assert('Body 429 is valid JSON', false, 'Could not parse the body');
        }

        // 4. Headers de rate limit presentes
        const hasLimitHeader = first429.headers.has('x-ratelimit-limit');
        const hasRemainingHeader = first429.headers.has('x-ratelimit-remaining');
        const hasResetHeader = first429.headers.has('x-ratelimit-reset');

        assert(
            'Header x-ratelimit-limit presente',
            hasLimitHeader,
            hasLimitHeader ? `value: ${first429.headers.get('x-ratelimit-limit')}` : 'FALTA',
        );

        assert(
            'Header x-ratelimit-remaining presente',
            hasRemainingHeader,
            hasRemainingHeader ? `value: ${first429.headers.get('x-ratelimit-remaining')}` : 'FALTA',
        );

        assert(
            'Header x-ratelimit-reset presente',
            hasResetHeader,
            hasResetHeader ? `value: ${first429.headers.get('x-ratelimit-reset')}` : 'FALTA',
        );
    } else {
        assert('Body 429 has correct format', false, 'No 429 received to verify');
        assert('Rate limit headers present', false, 'No 429 received to verify');
    }

    // --- Resumen ---
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    const total = results.length;

    console.log('\n' + '═'.repeat(50));
    console.log(`  RESUMEN: ${passed}/${total} passed, ${failed} failed`);
    console.log('═'.repeat(50));

    if (failed > 0) {
        console.log('\n  ❌ FALLOS:');
        for (const r of results.filter(r => !r.passed)) {
            console.log(`     - ${r.name}: ${r.detail}`);
        }
        process.exit(1);
    } else {
        console.log('\n  ✅ Rate limit works correctly. Bug immortalized. Never returns.\n');
        process.exit(0);
    }
}

main().catch((err) => {
    console.error('Error ejecutando test:', err);
    process.exit(1);
});
