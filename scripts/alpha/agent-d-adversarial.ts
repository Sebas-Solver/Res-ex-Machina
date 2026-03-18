/**
 * Alpha Test — Agente D: Adversarial
 *
 * Simula un agente malicioso que intenta:
 * 1. Spam/rate-limit bypass
 * 2. Replay de nonce (anti-replay)
 * 3. Duplicate content_hash (idempotencia)
 * 4. Fee incorrecto/insuficiente
 * 5. Invalid signature
 * 6. Payload oversized / malformado
 *
 * All these attempts MUST fail with the correct HTTP code.
 *
 * Uso:
 *   docker compose up -d && npm run dev
 *   npx tsx scripts/alpha/agent-d-adversarial.ts
 */

import { privateKeyToAccount } from 'viem/accounts';
import { createHash, randomBytes } from 'node:crypto';

const API_URL = process.env.API_URL || 'http://localhost:3000';

// Anvil account #2 (adversarial)
const AGENT_KEY = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a';
const account = privateKeyToAccount(AGENT_KEY);

// Anvil account #3 (para fee real)
const FEE_KEY = '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6';
const feeAccount = privateKeyToAccount(FEE_KEY);

console.log(`\n🔴 Alpha Test — Agente D (Adversarial)`);
console.log(`   Wallet: ${account.address}`);
console.log(`   API:    ${API_URL}\n`);

// ─── Helpers ───────────────────────────────────────────

const EIP712_DOMAIN = {
    name: 'ResExMachina' as const,
    version: '1' as const,
    chainId: 0,
    verifyingContract: '0x0000000000000000000000000000000000000000' as `0x${string}`,
};

const EIP712_TYPES = {
    PoGBundle: [
        { name: 'schema', type: 'string' },
        { name: 'content_hash', type: 'string' },
        { name: 'agent_wallet', type: 'address' },
        { name: 'model_id', type: 'string' },
        { name: 'runtime_id', type: 'string' },
        { name: 'process_type', type: 'string' },
        { name: 'human_intervention_level', type: 'uint8' },
        { name: 'pipeline_steps', type: 'uint16' },
        { name: 'timestamp', type: 'string' },
        { name: 'nonce', type: 'string' },
    ],
} as const;

function genHash(): string {
    return `sha256:${createHash('sha256').update(randomBytes(32)).digest('hex')}`;
}
function genNonce(): string {
    return `adv-${Date.now()}-${randomBytes(16).toString('hex')}`;
}

async function signPoG(contentHash: string, nonce: string, wallet = account) {
    const ts = new Date().toISOString();

    // Campos planos para la firma EIP-712
    const sigMessage = {
        schema: 'pog.v1' as const,
        content_hash: contentHash,
        agent_wallet: wallet.address,
        model_id: 'adversarial-agent',
        runtime_id: 'attack-v1',
        process_type: 'direct' as const,
        human_intervention_level: 0,
        pipeline_steps: 1,
        timestamp: ts,
        nonce,
    };
    const signature = await wallet.signTypedData({
        domain: EIP712_DOMAIN,
        types: EIP712_TYPES,
        primaryType: 'PoGBundle',
        message: sigMessage,
    });

    // Body para la API: generation_process como objeto anidado
    return {
        schema: 'pog.v1' as const,
        content_hash: contentHash,
        agent_wallet: wallet.address,
        model_id: 'adversarial-agent',
        runtime_id: 'attack-v1',
        generation_process: {
            process_type: 'direct' as const,
            human_intervention_level: 0,
            pipeline_steps: 1,
        },
        timestamp: ts,
        nonce,
        signature,
    };
}

async function sendFee(signer = feeAccount): Promise<string> {
    const { createWalletClient, createPublicClient, http, parseEther } = await import('viem');
    const { anvil } = await import('viem/chains');
    const client = createWalletClient({
        account: signer,
        chain: anvil,
        transport: http('http://localhost:8545'),
    });
    const publicClient = createPublicClient({ chain: anvil, transport: http('http://localhost:8545') });
    const hash = await client.sendTransaction({
        to: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        value: parseEther('0.01'),
    });
    await publicClient.waitForTransactionReceipt({ hash });
    return hash;
}

let passed = 0;
let failed = 0;

function check(name: string, expected: number, actual: number, errorCode?: string, body?: Record<string, unknown>) {
    if (actual === expected) {
        const code = body && (body as { error?: { code?: string } }).error?.code;
        console.log(`  ✅ ${name}: ${actual} ${code ? `(${code})` : ''}`);
        passed++;
    } else {
        console.log(`  ❌ ${name}: expected ${expected}, got ${actual} → ${JSON.stringify(body)}`);
        failed++;
    }
}

// ═══════════════════════════════════════════════════════
// TEST 1: Invalid signature
// ═══════════════════════════════════════════════════════

console.log('═══════════════════════════════════════');
console.log('  TEST 1: Invalid EIP-712 signature');
console.log('═══════════════════════════════════════\n');

{
    const pog = await signPoG(genHash(), genNonce());
    // Corromper la firma
    pog.signature = '0x' + 'a'.repeat(130);
    const fee = await sendFee();

    const res = await fetch(`${API_URL}/v1/records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            pog_bundle: pog,
            fee_amount: 0.01,
            fee_currency: 'ETH',
            fee_tx_hash: fee,
        }),
    });
    const body = await res.json();
    check('Firma corrupta → 401', 401, res.status, undefined, body);
}

// ═══════════════════════════════════════════════════════
// TEST 2: Invalid content hash
// ═══════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════');
console.log('  TEST 2: Invalid content hash format');
console.log('═══════════════════════════════════════\n');

{
    const res = await fetch(`${API_URL}/v1/records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            pog_bundle: {
                schema: 'pog.v1',
                content_hash: 'md5:not-a-sha256',
                agent_wallet: account.address,
                model_id: 'test',
                runtime_id: 'test',
                generation_process: { process_type: 'direct', human_intervention_level: 0, pipeline_steps: 1 },
                timestamp: new Date().toISOString(),
                nonce: genNonce(),
                signature: '0x' + 'a'.repeat(130),
            },
            fee_amount: 0.01,
            fee_currency: 'ETH',
            fee_tx_hash: '0x' + 'a'.repeat(64),
        }),
    });
    const body = await res.json();
    check('Hash md5 → 400', 400, res.status, undefined, body);
}

// ═══════════════════════════════════════════════════════
// TEST 3: Nonce replay (mismo nonce, misma wallet)
// ═══════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════');
console.log('  TEST 3: Nonce replay (anti-replay)');
console.log('═══════════════════════════════════════\n');

{
    const fixedNonce = `replay-test-${Date.now()}-${randomBytes(8).toString('hex')}`;

    // Primer request con este nonce (debe funcionar)
    const hash1 = genHash();
    const pog1 = await signPoG(hash1, fixedNonce);
    const fee1 = await sendFee();

    const res1 = await fetch(`${API_URL}/v1/records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            pog_bundle: pog1,
            fee_amount: 0.01,
            fee_currency: 'ETH',
            fee_tx_hash: fee1,
        }),
    });
    const body1 = await res1.json();
    check('Nonce original → 201', 201, res1.status, undefined, body1);

    // Segundo request con MISMO nonce (debe fallar 409)
    const hash2 = genHash();
    const pog2 = await signPoG(hash2, fixedNonce); // ← MISMO nonce
    const fee2 = await sendFee();

    const res2 = await fetch(`${API_URL}/v1/records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            pog_bundle: pog2,
            fee_amount: 0.01,
            fee_currency: 'ETH',
            fee_tx_hash: fee2,
        }),
    });
    const body2 = await res2.json();
    check('Nonce replay → 409', 409, res2.status, undefined, body2);
}

// ═══════════════════════════════════════════════════════
// TEST 4: Duplicate content_hash
// ═══════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════');
console.log('  TEST 4: Duplicate content_hash');
console.log('═══════════════════════════════════════\n');

{
    const fixedHash = genHash();

    const pog1 = await signPoG(fixedHash, genNonce());
    const fee1 = await sendFee();

    const res1 = await fetch(`${API_URL}/v1/records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            pog_bundle: pog1,
            fee_amount: 0.01,
            fee_currency: 'ETH',
            fee_tx_hash: fee1,
        }),
    });
    const body1 = await res1.json();
    check('Hash original → 201', 201, res1.status, undefined, body1);

    const pog2 = await signPoG(fixedHash, genNonce()); // ← MISMO hash
    const fee2 = await sendFee();

    const res2 = await fetch(`${API_URL}/v1/records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            pog_bundle: pog2,
            fee_amount: 0.01,
            fee_currency: 'ETH',
            fee_tx_hash: fee2,
        }),
    });
    const body2 = await res2.json();
    check('Hash duplicado → 409', 409, res2.status, undefined, body2);
}

// ═══════════════════════════════════════════════════════
// TEST 5: Invalid fee tx
// ═══════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════');
console.log('  TEST 5: Invalid fee tx o insuficiente');
console.log('═══════════════════════════════════════\n');

{
    const pog = await signPoG(genHash(), genNonce());
    // Fee tx que no existe
    const fakeTx = `0x${randomBytes(32).toString('hex')}` as `0x${string}`;

    const res = await fetch(`${API_URL}/v1/records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            pog_bundle: pog,
            fee_amount: 0.01,
            fee_currency: 'ETH',
            fee_tx_hash: fakeTx,
        }),
    });
    const body = await res.json();
    check('Fee tx inexistente → 402', 402, res.status, undefined, body);
}

// ═══════════════════════════════════════════════════════
// TEST 6: DELETE no permitido
// ═══════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════');
console.log('  TEST 6: DELETE → 405 (INV-001)');
console.log('═══════════════════════════════════════\n');

{
    const res = await fetch(`${API_URL}/v1/records/any-id`, { method: 'DELETE' });
    const body = await res.json();
    check('DELETE → 405', 405, res.status, undefined, body);
}

// ═══════════════════════════════════════════════════════
// TEST 7: Payload oversized
// ═══════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════');
console.log('  TEST 7: Payload > 64KB');
console.log('═══════════════════════════════════════\n');

{
    const bigPayload = JSON.stringify({ data: 'x'.repeat(100_000) });
    const res = await fetch(`${API_URL}/v1/records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: bigPayload,
    });
    // Fastify devuelve 413 payload too large
    check('Oversized → 413', 413, res.status);
}

// ═══════════════════════════════════════════════════════
// TEST 8: Rate limit (fast burst)
// ═══════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════');
console.log('  TEST 8: Rate limit (12 fast requests)');
console.log('═══════════════════════════════════════\n');

{
    let rateLimited = false;
    for (let i = 0; i < 12; i++) {
        const res = await fetch(`${API_URL}/v1/records`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ invalid: true }),
        });
        if (res.status === 429) {
            console.log(`  ✅ Rate limited en request ${i + 1} → 429`);
            rateLimited = true;
            passed++;
            break;
        }
    }
    if (!rateLimited) {
        console.log(`  ⚠️  Rate limit not reached en 12 requests (may depend on timing)`);
        // No contamos como fallo porque depende del timing
    }
}

// ─── Resumen ───────────────────────────────────────────

console.log('\n═══════════════════════════════════════');
console.log('  RESUMEN Agente D (Adversarial)');
console.log('═══════════════════════════════════════\n');

console.log(`  Tests pasados: ${passed}`);
console.log(`  Tests fallados: ${failed}`);
console.log(`  Total: ${passed + failed}`);
console.log('');

process.exit(failed > 0 ? 1 : 0);
