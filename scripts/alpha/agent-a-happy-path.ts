// SPDX-License-Identifier: Apache-2.0

/**
 * Alpha Test — Agent A: Happy Path + Burst
 *
 * Simulates a legitimate agent that:
 * 1. Generates 20 records in a burst
 * 2. Verifies all were created correctly
 * 3. Checks idempotency
 * 4. Exports and verifies a receipt offline
 *
 * Usage:
 *   docker compose up -d
 *   npm run db:push
 *   npm run dev          (another terminal)
 *   npm run worker:anchor (another terminal)
 *   npx tsx scripts/alpha/agent-a-happy-path.ts
 */

import { privateKeyToAccount } from 'viem/accounts';
import { createHash, randomBytes } from 'node:crypto';

// ─── Config ────────────────────────────────────────────
const API_URL = process.env.API_URL || 'http://localhost:3000';
const BURST_COUNT = 20;

// Anvil account #1 (not #0 which is the receiver)
const AGENT_PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const account = privateKeyToAccount(AGENT_PRIVATE_KEY);

console.log(`\n⚖️  Alpha Test — Agent A (Happy Path)`);
console.log(`   Wallet: ${account.address}`);
console.log(`   API:    ${API_URL}`);
console.log(`   Burst:  ${BURST_COUNT} records\n`);

// ─── Helpers ───────────────────────────────────────────

const EIP712_DOMAIN = {
    name: 'ResExMachina' as const,
    version: '1' as const,
    chainId: 0,
    verifyingContract: '0x0000000000000000000000000000000000000000' as `0x${string}`,
} as const;

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

function generateContentHash(): string {
    const content = randomBytes(64).toString('hex');
    const hash = createHash('sha256').update(content).digest('hex');
    return `sha256:${hash}`;
}

function generateNonce(): string {
    return `alpha-a-${Date.now()}-${randomBytes(16).toString('hex')}`;
}

async function signPoG(contentHash: string, nonce: string) {
    const ts = new Date().toISOString();

    // Flat fields for EIP-712 signing
    const sigMessage = {
        schema: 'pog.v1',
        content_hash: contentHash,
        agent_wallet: account.address,
        model_id: 'alpha-test-gpt4o',
        runtime_id: 'alpha-agent-a-v1',
        process_type: 'direct',
        human_intervention_level: 0,
        pipeline_steps: 1,
        timestamp: ts,
        nonce,
    };

    const signature = await account.signTypedData({
        domain: EIP712_DOMAIN,
        types: EIP712_TYPES,
        primaryType: 'PoGBundle',
        message: sigMessage,
    });

    // API body: generation_process as nested object
    return {
        schema: 'pog.v1',
        content_hash: contentHash,
        agent_wallet: account.address,
        model_id: 'alpha-test-gpt4o',
        runtime_id: 'alpha-agent-a-v1',
        generation_process: {
            process_type: 'direct',
            human_intervention_level: 0,
            pipeline_steps: 1,
        },
        timestamp: ts,
        nonce,
        signature,
    };
}

async function sendFeeTx(): Promise<string> {
    // Send a real payment to the fee receiver on Anvil
    const { createWalletClient, createPublicClient, http, parseEther } = await import('viem');
    const { anvil } = await import('viem/chains');

    const client = createWalletClient({
        account,
        chain: anvil,
        transport: http('http://localhost:8545'),
    });

    const publicClient = createPublicClient({
        chain: anvil,
        transport: http('http://localhost:8545'),
    });

    const hash = await client.sendTransaction({
        to: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', // Anvil account #0 = fee receiver
        value: parseEther('0.01'),
    });

    // Wait for confirmation
    await publicClient.waitForTransactionReceipt({ hash });
    return hash;
}

// ─── Test: Burst 20 records ────────────────────────────

interface TestResult {
    index: number;
    success: boolean;
    recordId?: string;
    state?: string;
    durationMs: number;
    error?: string;
}

const results: TestResult[] = [];
const recordIds: string[] = [];

console.log('═══════════════════════════════════════');
console.log('  TEST 1: Burst of 20 records');
console.log('═══════════════════════════════════════\n');

for (let i = 0; i < BURST_COUNT; i++) {
    const start = performance.now();
    try {
        // 1. Generate content and signature
        const contentHash = generateContentHash();
        const nonce = generateNonce();
        const pogBundle = await signPoG(contentHash, nonce);

        // 2. Send real fee on Anvil
        const feeTxHash = await sendFeeTx();

        // 3. POST /v1/records
        const res = await fetch(`${API_URL}/v1/records`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pog_bundle: pogBundle,
                content_type: 'text/plain',
                visibility: 'proof_only',
                tags: ['alpha-test', `burst-${i}`],
                fee_amount: 0.01,
                fee_currency: 'ETH',
                fee_tx_hash: feeTxHash,
            }),
        });

        const body = await res.json();
        const elapsed = Math.round(performance.now() - start);

        if (res.status === 201) {
            recordIds.push(body.record_id);
            results.push({ index: i, success: true, recordId: body.record_id, state: body.state, durationMs: elapsed });
            console.log(`  ✅ [${i + 1}/${BURST_COUNT}] ${body.record_id} (${elapsed}ms)`);
        } else {
            results.push({ index: i, success: false, durationMs: elapsed, error: JSON.stringify(body) });
            console.log(`  ❌ [${i + 1}/${BURST_COUNT}] Status ${res.status}: ${JSON.stringify(body)} (${elapsed}ms)`);
        }
    } catch (err) {
        const elapsed = Math.round(performance.now() - start);
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ index: i, success: false, durationMs: elapsed, error: msg });
        console.log(`  ❌ [${i + 1}/${BURST_COUNT}] Error: ${msg} (${elapsed}ms)`);
    }
}

// ─── Test: Idempotencia ────────────────────────────────

console.log('\n═══════════════════════════════════════');
console.log('  TEST 2: Idempotencia (duplicate hash)');
console.log('═══════════════════════════════════════\n');

if (recordIds.length > 0) {
    // Try to create a record with the same content_hash (already exists in DB)
    const duplicateHash = 'sha256:0000000000000000000000000000000000000000000000000000000000000000';
    const nonce1 = generateNonce();
    const pog1 = await signPoG(duplicateHash, nonce1);
    const fee1 = await sendFeeTx();

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

    if (res1.status === 201) {
        console.log(`  ✅ First record with fixed hash: ${body1.record_id}`);

        // Second attempt with same hash
        const nonce2 = generateNonce();
        const pog2 = await signPoG(duplicateHash, nonce2);
        const fee2 = await sendFeeTx();

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

        if (res2.status === 409) {
            console.log(`  ✅ Idempotency correct: 409 → ${body2.error?.code}`);
        } else {
            console.log(`  ❌ Expected 409, got ${res2.status}: ${JSON.stringify(body2)}`);
        }
    } else {
        console.log(`  ⚠️  First record failed: ${res1.status}`);
    }
}

// ─── Test: Verify + Export ─────────────────────────────

console.log('\n═══════════════════════════════════════');
console.log('  TEST 3: GET verify + export');
console.log('═══════════════════════════════════════\n');

if (recordIds.length > 0) {
    const testId = recordIds[0];

    // GET /records/:id
    const resGet = await fetch(`${API_URL}/v1/records/${testId}`);
    const record = await resGet.json();
    console.log(`  GET /${testId}: ${resGet.status} → state: ${record.state}`);

    // GET /records/:id/export
    const resExport = await fetch(`${API_URL}/v1/records/${testId}/export`);
    const receipt = await resExport.json();
    console.log(`  EXPORT /${testId}: ${resExport.status} → schema: ${receipt.schema}`);

    // Verify receipt_hash offline
    if (receipt.receipt_hash && receipt.pog_bundle) {
        const canonical = [
            receipt.record_id,
            receipt.content_hash,
            receipt.pog_bundle.agent_wallet.toLowerCase(),
            receipt.pog_bundle.nonce,
            receipt.created_at,
        ].join('|');
        const hash = createHash('sha256').update(canonical).digest('hex');
        const expected = `sha256:${hash}`;
        const match = expected === receipt.receipt_hash;
        console.log(`  Receipt hash offline: ${match ? '✅' : '❌'} (${match ? 'match' : 'MISMATCH'})`);
    }
}

// ─── Summary ─────────────────────────────────────────

console.log('\n═══════════════════════════════════════');
console.log('  SUMMARY Agent A');
console.log('═══════════════════════════════════════\n');

const successes = results.filter(r => r.success);
const failures = results.filter(r => !r.success);
const durations = results.map(r => r.durationMs).sort((a, b) => a - b);
const p95 = durations[Math.floor(durations.length * 0.95)] ?? 0;
const avg = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);

console.log(`  Records created: ${successes.length}/${BURST_COUNT}`);
console.log(`  Failures:        ${failures.length}`);
console.log(`  Avg latency:     ${avg}ms`);
console.log(`  p95 latency:     ${p95}ms`);
console.log(`  p95 < 3000ms?    ${p95 < 3000 ? '✅ YES' : '❌ NO'}`);

if (failures.length > 0) {
    console.log('\n  Failure details:');
    failures.forEach(f => console.log(`    [${f.index}] ${f.error}`));
}

console.log('');
process.exit(failures.length > 0 ? 1 : 0);
