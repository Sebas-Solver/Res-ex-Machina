/**
 * 🔥 Smoke Test — Res ex Machina SDK E2E against Live API
 *
 * Validates the FULL flow using the published @res-ex-machina/sdk package
 * against the production API at https://res-ex-machina-api.onrender.com.
 *
 * Flow:
 *   1. Health check — Is the API alive?
 *   2. Create wallet + check balance
 *   3. Pay fee on-chain (BYO mode)
 *   4. Record an AI output via rxm.record()
 *   5. Verify the content hash via rxm.verify()
 *   6. Export the verifiable receipt via rxm.export()
 *
 * Usage:
 *   npx tsx scripts/smoke-test-live.ts
 *
 * Requires:
 *   - TEST_AGENT_PRIVATE_KEY in .env (with Base Sepolia ETH)
 *   - Internet connection (calls live API + Base Sepolia RPC)
 */

import 'dotenv/config';
import { privateKeyToAccount } from 'viem/accounts';
import {
    createPublicClient,
    createWalletClient,
    http,
    formatEther,
    parseEther,
    type Hex,
    type Address,
} from 'viem';
import { baseSepolia } from 'viem/chains';
import { RxMClient } from '@res-ex-machina/sdk';

// ──────────────────────────────────────────────
// Config
// ──────────────────────────────────────────────

const API_URL = 'https://res-ex-machina-api.onrender.com';
const RPC_URL = 'https://sepolia.base.org';
const FEE_RECEIVER = '0x13bB040691BBa236a2A2AB83fE904EcC965Ba8a0' as Address;
const FEE_AMOUNT = 0.0002; // ETH

const PRIVATE_KEY = process.env.TEST_AGENT_PRIVATE_KEY;
if (!PRIVATE_KEY) {
    console.error('❌ Missing TEST_AGENT_PRIVATE_KEY in .env');
    console.error('   Add: TEST_AGENT_PRIVATE_KEY=0xYOUR_PRIVATE_KEY');
    process.exit(1);
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function elapsed(start: bigint): string {
    const ms = Number(process.hrtime.bigint() - start) / 1_000_000;
    return `${ms.toFixed(0)}ms`;
}

function pass(label: string, detail: string, time: string) {
    console.log(`  ✅ ${label.padEnd(24)} ${detail.padEnd(46)} ${time}`);
}

function fail(label: string, error: string) {
    console.error(`  ❌ ${label.padEnd(24)} ${error}`);
}

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ──────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────

async function main() {
    const totalStart = process.hrtime.bigint();
    let steps = 0;
    let passed = 0;

    console.log('\n╔══════════════════════════════════════════════════════════════════════╗');
    console.log('║  🔥  RES EX MACHINA — SDK Smoke Test (Live API)                    ║');
    console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

    // ─── Setup ──────────────────────────────────────────────
    const account = privateKeyToAccount(PRIVATE_KEY as Hex);

    const publicClient = createPublicClient({
        chain: baseSepolia,
        transport: http(RPC_URL),
    });

    const walletClient = createWalletClient({
        account,
        chain: baseSepolia,
        transport: http(RPC_URL),
    });

    console.log(`  🔑 Wallet:  ${account.address}`);
    console.log(`  🌐 API:     ${API_URL}`);
    console.log(`  ⛓️  Chain:   Base Sepolia (84532)`);
    console.log(`  💰 Fee:     ${FEE_AMOUNT} ETH → ${FEE_RECEIVER}`);
    console.log('');
    console.log('  Step                     Result                                         Time');
    console.log('  ────────────────────────  ──────────────────────────────────────────     ─────');

    // ─── Step 1: Health Check ──────────────────────────────
    steps++;
    let t = process.hrtime.bigint();
    try {
        const res = await fetch(`${API_URL}/v1/health`);
        const health = await res.json() as { status: string };
        if (health.status === 'ok' || health.status === 'healthy') {
            pass('1. Health check', `status: ${health.status}`, elapsed(t));
            passed++;
        } else {
            fail('1. Health check', `Unexpected status: ${health.status}`);
        }
    } catch (err: any) {
        fail('1. Health check', err.message);
        console.error('\n  💀 API is down. Cannot continue.\n');
        process.exit(1);
    }

    // ─── Step 2: Wallet Balance ────────────────────────────
    steps++;
    t = process.hrtime.bigint();
    try {
        const balance = await publicClient.getBalance({ address: account.address });
        const ethBalance = parseFloat(formatEther(balance));

        if (ethBalance >= FEE_AMOUNT) {
            pass('2. Wallet balance', `${ethBalance.toFixed(6)} ETH (sufficient)`, elapsed(t));
            passed++;
        } else {
            fail('2. Wallet balance', `${ethBalance.toFixed(6)} ETH — need at least ${FEE_AMOUNT}`);
            console.error('\n  💀 Insufficient funds. Get testnet ETH from a faucet\n');
            process.exit(1);
        }
    } catch (err: any) {
        fail('2. Wallet balance', err.message);
    }

    // ─── Step 3: Pay Fee (BYO mode) ───────────────────────
    steps++;
    t = process.hrtime.bigint();
    let feeTxHash: Hex = '' as Hex;
    try {
        feeTxHash = await walletClient.sendTransaction({
            to: FEE_RECEIVER,
            value: parseEther(FEE_AMOUNT.toString()),
        });

        // Wait for 1 confirmation
        await publicClient.waitForTransactionReceipt({
            hash: feeTxHash,
            confirmations: 1,
        });

        pass('3. Pay fee (on-chain)', `tx: ${feeTxHash.slice(0, 14)}…`, elapsed(t));
        passed++;

        // Wait for RPC propagation to the server's node
        console.log('     ⏳ Waiting 15s for RPC propagation to server node...');
        await sleep(15_000);
    } catch (err: any) {
        fail('3. Pay fee (on-chain)', err.message);
        console.error('\n  💀 Fee payment failed. Cannot continue.\n');
        process.exit(1);
    }

    // ─── Step 4: Record via SDK (BYO fee) ─────────────────
    steps++;
    t = process.hrtime.bigint();
    const testContent = `Smoke test — ${new Date().toISOString()} — This output was generated by an AI model as a test.`;
    let recordId = '';
    let contentHashForVerify = '';

    try {
        const rxm = new RxMClient({
            account,
            rpcUrl: RPC_URL,
            apiUrl: API_URL,
            feeReceiverAddress: FEE_RECEIVER,
            feeAmount: FEE_AMOUNT,
            chainId: 84532,
        });

        const receipt = await rxm.record(testContent, {
            modelId: 'smoke-test:sdk:live',
            contentType: 'text/plain',
            tags: ['smoke-test', 'sdk-e2e'],
            processType: 'autonomous',
            feeTxHash, // BYO: use the tx we already paid
        });

        recordId = receipt.recordId;
        pass('4. Record (SDK → API)', `id: ${recordId.slice(0, 8)}…  state: ${receipt.state}`, elapsed(t));
        passed++;
    } catch (err: any) {
        fail('4. Record (SDK → API)', err.message);
        if (err.cause) console.error('     cause:', JSON.stringify(err.cause, null, 2));
        if (err.body) console.error('     body:', JSON.stringify(err.body, null, 2));
        if (err.statusCode) console.error('     status:', err.statusCode);
        console.error('\n  💀 Record failed. Cannot continue.\n');
        process.exit(1);
    }

    // ─── Step 5: Verify by Hash ───────────────────────────
    steps++;
    t = process.hrtime.bigint();
    try {
        const rxm = new RxMClient({
            account,
            rpcUrl: RPC_URL,
            apiUrl: API_URL,
            feeReceiverAddress: FEE_RECEIVER,
            feeAmount: FEE_AMOUNT,
        });

        // Pass raw content — SDK computes hash internally with sha256: prefix
        const result = await rxm.verify(testContent);
        if (result.exists) {
            pass('5. Verify (content)', `exists: true  recordId: ${(result.recordId || '').slice(0, 8)}…`, elapsed(t));
            passed++;
        } else {
            fail('5. Verify (content)', `exists: false — content not found`);
        }
    } catch (err: any) {
        fail('5. Verify (content)', err.message);
    }

    // ─── Step 6: Export Receipt ────────────────────────────
    steps++;
    t = process.hrtime.bigint();
    try {
        const rxm = new RxMClient({
            account,
            rpcUrl: RPC_URL,
            apiUrl: API_URL,
            feeReceiverAddress: FEE_RECEIVER,
            feeAmount: FEE_AMOUNT,
        });

        const exported = await rxm.export(recordId) as any;
        // API returns snake_case, SDK types may be camelCase — handle both
        const pogBundle = exported.pogBundle || exported.pog_bundle;
        const contentHash = exported.contentHash || exported.content_hash;
        const hasPoG = !!pogBundle;
        const hasHash = !!contentHash;
        if (hasPoG && hasHash) {
            pass('6. Export receipt', `PoG: ✓  hash: ${String(contentHash).slice(0, 12)}…`, elapsed(t));
            passed++;
        } else {
            fail('6. Export receipt', `Missing — PoG: ${hasPoG}, hash: ${hasHash}`);
            console.error('     fields:', Object.keys(exported).join(', '));
        }
    } catch (err: any) {
        fail('6. Export receipt', err.message);
    }

    // ─── Summary ──────────────────────────────────────────
    console.log('');
    console.log('  ═══════════════════════════════════════════════════════════════════');
    const totalTime = elapsed(totalStart);
    if (passed === steps) {
        console.log(`  🎉 ALL ${passed}/${steps} STEPS PASSED                                              ${totalTime}`);
        console.log('');
        console.log(`  Record: ${API_URL}/v1/records/${recordId}`);
    } else {
        console.log(`  ⚠️  ${passed}/${steps} steps passed — ${steps - passed} FAILED                               ${totalTime}`);
    }
    console.log('  ═══════════════════════════════════════════════════════════════════\n');

    process.exit(passed === steps ? 0 : 1);
}

main().catch((err) => {
    console.error('💥 Fatal error:', err.message || err);
    process.exit(1);
});
