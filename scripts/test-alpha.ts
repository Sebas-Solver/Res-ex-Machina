/**
 * 🧪 Test E2E — Res ex Machina Alpha
 *
 * Este script ejecuta el flujo completo de registro de un contenido:
 *   1. Genera un contenido de prueba y calcula su hash SHA-256
 *   2. Sends the fee transaction to the fee receiver on Base Sepolia
 *   3. Firma el PoG bundle con EIP-712
 *   4. Calls POST /v1/records on the public API
 *   5. Queries the record to verify the result
 *   6. Verifica links auto-generados (Issue #20)
 *   7. Exporta receipt y verifica estructura
 *   8. Verifica por content_hash
 *   9. Lista records propios con auth de wallet (Issue #26)
 *
 * Uso:
 *   npx tsx scripts/test-alpha.ts
 *
 * Requires the TEST_AGENT_PRIVATE_KEY variable (private key of the agent wallet).
 * Can be set in .env or passed via command line.
 */

import 'dotenv/config';
import { createHash } from 'node:crypto';
import {
    createPublicClient,
    createWalletClient,
    http,
    formatEther,
    type Hex,
    type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

// ──────────────────────────────────────────────
// Config
// ──────────────────────────────────────────────

const API_URL = 'https://res-ex-machina-api.onrender.com';
const FEE_RECEIVER: Address = '0x13bB040691BBa236a2A2AB83fE904EcC965Ba8a0';
const FEE_AMOUNT = 0.0002; // ETH (minimum on Render is 0.0001)

const AGENT_PRIVATE_KEY = process.env.TEST_AGENT_PRIVATE_KEY;
if (!AGENT_PRIVATE_KEY) {
    console.error('❌ Missing TEST_AGENT_PRIVATE_KEY in .env');
    console.error('   Add this line to your .env:');
    console.error('   TEST_AGENT_PRIVATE_KEY=0xYOUR_AGENT_PRIVATE_KEY');
    process.exit(1);
}

// ──────────────────────────────────────────────
// Setup
// ──────────────────────────────────────────────

const account = privateKeyToAccount(AGENT_PRIVATE_KEY as Hex);
console.log(`\n🔑 Wallet del agente: ${account.address}`);

const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http('https://sepolia.base.org'),
});

const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http('https://sepolia.base.org'),
});

// EIP-712 Domain y Types (deben coincidir con el servidor)
const EIP712_DOMAIN = {
    name: 'ResExMachina',
    version: '1',
    chainId: 0,
    verifyingContract: '0x0000000000000000000000000000000000000000' as Address,
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

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function sha256(text: string): string {
    return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}

function generateNonce(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let nonce = '';
    for (let i = 0; i < 32; i++) {
        nonce += chars[Math.floor(Math.random() * chars.length)];
    }
    return nonce;
}

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ──────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────

async function main() {
    console.log('═══════════════════════════════════════════');
    console.log('  🧪 Test E2E — Res ex Machina Alpha');
    console.log('═══════════════════════════════════════════\n');

    // ── Step 0: Verify the API is alive ──
    console.log('📡 Paso 0: Verifying the API is online...');
    const healthRes = await fetch(`${API_URL}/v1/health`);
    const health = await healthRes.json();
    if (health.status !== 'ok') {
        console.error('❌ The API is not healthy:', health);
        process.exit(1);
    }
    console.log(`   ✅ API OK (DB: ${health.checks.database.latencyMs}ms, Redis: ${health.checks.redis.latencyMs}ms, Blockchain: ${health.checks.blockchain.latencyMs}ms)\n`);

    // ── Paso 1: Generar contenido de prueba ──
    console.log('📝 Paso 1: Generando contenido de prueba...');
    const testContent = `Este es un contenido de prueba generado por IA. Timestamp: ${new Date().toISOString()}. Random: ${Math.random()}`;
    const contentHash = sha256(testContent);
    console.log(`   Contenido: "${testContent.substring(0, 60)}..."`);
    console.log(`   Hash: ${contentHash}\n`);

    // ── Step 2: Verify balance ──
    console.log('💰 Paso 2: Verificando balance del agente...');
    const balance = await publicClient.getBalance({ address: account.address });
    const balanceEth = parseFloat(formatEther(balance));
    console.log(`   Balance: ${balanceEth.toFixed(6)} ETH`);
    if (balanceEth < FEE_AMOUNT + 0.0001) { // fee + gas
        console.error(`   ❌ Balance insuficiente. Necesitas al menos ${FEE_AMOUNT + 0.0001} ETH`);
        console.error('   Consigue ETH en: https://console.optimism.io/faucet');
        process.exit(1);
    }
    console.log(`   ✅ Balance suficiente\n`);

    // ── Step 3: Send fee transaction ──
    console.log(`💸 Paso 3: Enviando fee de ${FEE_AMOUNT} ETH a ${FEE_RECEIVER}...`);
    const feeValue = BigInt(Math.round(FEE_AMOUNT * 1e18));
    const feeTxHash = await walletClient.sendTransaction({
        to: FEE_RECEIVER,
        value: feeValue,
    });
    console.log(`   📤 Tx enviada: ${feeTxHash}`);
    console.log('   ⏳ Waiting for confirmation...');

    const feeReceipt = await publicClient.waitForTransactionReceipt({ hash: feeTxHash });
    console.log(`   ✅ Confirmada en bloque ${feeReceipt.blockNumber}`);
    console.log('   ⏳ Waiting 10s for network propagation...');
    await sleep(10000);
    console.log('   ✅ Listo\n');

    // ── Paso 4: Firmar PoG bundle con EIP-712 ──
    console.log('✍️  Paso 4: Firmando PoG bundle con EIP-712...');
    const nonce = generateNonce();
    const timestamp = new Date().toISOString();

    const pogMessage = {
        schema: 'pog.v1',
        content_hash: contentHash,
        agent_wallet: account.address as Address,
        model_id: 'gpt-4-test',
        runtime_id: 'test-script-alpha-v1',
        process_type: 'direct',
        human_intervention_level: 0,
        pipeline_steps: 1,
        timestamp,
        nonce,
    };

    const signature = await walletClient.signTypedData({
        domain: EIP712_DOMAIN,
        types: EIP712_TYPES,
        primaryType: 'PoGBundle',
        message: pogMessage,
    });
    console.log(`   Signature: ${signature.substring(0, 20)}...`);
    console.log(`   Nonce: ${nonce}\n`);

    // ── Paso 5: Llamar a POST /v1/records ──
    console.log('🚀 Paso 5: Enviando record a la API...');
    const requestBody = {
        pog_bundle: {
            schema: 'pog.v1',
            content_hash: contentHash,
            agent_wallet: account.address,
            model_id: 'gpt-4-test',
            runtime_id: 'test-script-alpha-v1',
            generation_process: {
                process_type: 'direct',
                human_intervention_level: 0,
                pipeline_steps: 1,
            },
            timestamp,
            nonce,
            signature,
        },
        content_type: 'text/plain',
        visibility: 'proof_only',
        tags: ['test', 'alpha'],
        fee_amount: FEE_AMOUNT,
        fee_currency: 'ETH',
        fee_tx_hash: feeTxHash,
    };

    const apiRes = await fetch(`${API_URL}/v1/records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
    });

    const apiData = await apiRes.json();

    if (apiRes.status === 201) {
        console.log(`   ✅ Record creado exitosamente!`);
        console.log(`   Record ID: ${apiData.record_id}`);
        console.log(`   Estado: ${apiData.state}`);
        console.log(`   State info: ${apiData.state_info.description} (terminal: ${apiData.state_info.terminal})`);
        console.log(`   Receipt hash: ${apiData.receipt_hash}\n`);
    } else {
        console.error(`   ❌ Error ${apiRes.status}:`, JSON.stringify(apiData, null, 2));
        process.exit(1);
    }

    // ── Step 6: Wait and verify anchoring ──
    console.log('⚓ Paso 6: Esperando anchoring (puede tardar ~30 seg)...');
    let anchored = false;
    let anchoredData: any = null;
    for (let i = 0; i < 12; i++) {
        await sleep(5000);
        const checkRes = await fetch(`${API_URL}/v1/records/${apiData.record_id}`);
        const checkData = await checkRes.json();
        console.log(`   [${(i + 1) * 5}s] Estado: ${checkData.state}`);

        if (checkData.state === 'anchored') {
            anchored = true;
            anchoredData = checkData;
            console.log(`\n   ✅ ANCHORED ON BLOCKCHAIN!`);
            console.log(`   🔗 Tx: ${checkData.anchor.explorer_url}`);
            console.log(`   📦 Bloque: ${checkData.anchor.block}`);
            console.log(`   ⛓️  Chain: ${checkData.anchor.network_name} (ID: ${checkData.anchor.chain_id})`);
            break;
        } else if (checkData.state === 'anchor_failed') {
            console.error(`\n   ❌ Anchoring failed`);
            break;
        }
    }

    if (!anchored) {
        console.log(`\n   ⏳ Anchoring has not completed yet. You can check manually:`);
        console.log(`   ${API_URL}/v1/records/${apiData.record_id}`);
    }

    // ── Step 7: Verify auto-generated links (Issue #20) ──
    console.log('\n🔗 Paso 7: Verificando links auto-generados...');
    const linksRes = await fetch(`${API_URL}/v1/records/${apiData.record_id}`);
    const linksData = await linksRes.json();

    if (linksData.links) {
        console.log(`   ✅ Links presentes en respuesta:`);
        console.log(`      self:   ${linksData.links.self}`);
        console.log(`      export: ${linksData.links.export}`);
        console.log(`      verify: ${linksData.links.verify}`);

        // Verify that links are accessible
        const selfCheck = await fetch(linksData.links.self);
        console.log(`   ${selfCheck.ok ? '✅' : '❌'} Link 'self' ${selfCheck.ok ? 'funciona' : 'falla'} (${selfCheck.status})`);

        const verifyCheck = await fetch(linksData.links.verify);
        console.log(`   ${verifyCheck.ok ? '✅' : '❌'} Link 'verify' ${verifyCheck.ok ? 'funciona' : 'falla'} (${verifyCheck.status})`);
    } else {
        console.log(`   ⚠️ Links no presentes (API_BASE_URL no configurada?)`);
    }

    // Verify fee block with explorer
    if (linksData.fee) {
        console.log(`\n   💰 Fee block:`);
        console.log(`      amount:       ${linksData.fee.amount} ${linksData.fee.currency}`);
        console.log(`      network:      ${linksData.fee.network_name}`);
        console.log(`      explorer_url: ${linksData.fee.explorer_url}`);
    }

    // Verify state_info
    console.log(`\n   📊 State info: "${linksData.state_info?.description}" (terminal: ${linksData.state_info?.terminal}, retryable: ${linksData.state_info?.retryable})`);

    // ── Paso 8: Exportar receipt ──
    console.log('\n📋 Paso 8: Exportando receipt verificable...');
    const exportRes = await fetch(`${API_URL}/v1/records/${apiData.record_id}/export`);
    const receipt = await exportRes.json();

    // Verify export structure
    const exportChecks = [
        ['schema', receipt.schema === 'rex.receipt.v1'],
        ['spec_version', receipt.spec_version === '1.2'],
        ['eip712_domain', !!(receipt.pog_bundle as any)?.eip712_domain],
        ['verification', !!receipt.verification],
        ['links', !!receipt.links],
        ['fee.explorer_url', !!receipt.fee?.explorer_url],
    ];
    console.log('   Export structure verification:');
    for (const [name, ok] of exportChecks) {
        console.log(`      ${ok ? '✅' : '❌'} ${name}`);
    }

    // Also show compact export
    console.log('\n   📦 Export compacto:');
    const compactRes = await fetch(`${API_URL}/v1/records/${apiData.record_id}/export?mode=compact`);
    const compact = await compactRes.json();
    const compactChecks = [
        ['schema', compact.schema === 'rex.receipt.v1'],
        ['sin links (ahorro tokens)', !compact.links],
        ['sin visibility', !compact.visibility],
        ['pog_bundle.signature', !!(compact.pog_bundle as any)?.signature],
    ];
    for (const [name, ok] of compactChecks) {
        console.log(`      ${ok ? '✅' : '❌'} ${name}`);
    }

    // ── Step 9: Verify by content_hash ──
    console.log('\n🔍 Paso 9: Verificando por content_hash...');
    const verifyRes = await fetch(`${API_URL}/v1/records/verify?content_hash=${contentHash}`);
    const verifyData = await verifyRes.json();
    console.log(`   ✅ Record found: ${verifyData.exists}`);
    console.log(`   Record ID: ${verifyData.record_id}`);
    console.log(`   Estado: ${verifyData.state}`);
    console.log(`   State info: ${verifyData.state_info?.description}`);

    // ── Paso 10: Listar mis records (autenticado) ──
    console.log('\n🔐 Paso 10: GET /records/mine (autenticado por firma de wallet)...');
    const authTimestamp = new Date().toISOString();
    const authMessage = `RexAuth:${authTimestamp}`;
    const authSignature = await account.signMessage({ message: authMessage });

    const mineRes = await fetch(`${API_URL}/v1/records/mine`, {
        headers: {
            'X-Wallet-Address': account.address,
            'X-Signature': authSignature,
            'X-Timestamp': authTimestamp,
        },
    });
    const mineData = await mineRes.json();

    if (mineRes.ok) {
        console.log(`   ✅ Authentication successful`);
        console.log(`   Wallet: ${mineData.wallet}`);
        console.log(`   Total records: ${mineData.total}`);
        console.log(`   Records on this page: ${mineData.records?.length}`);
        console.log(`   Pagination: limit=${mineData.pagination?.limit}, offset=${mineData.pagination?.offset}, has_more=${mineData.pagination?.has_more}`);

        // Verify the record we just created is in the list
        const found = mineData.records?.some((r: any) => r.record_id === apiData.record_id);
        console.log(`   ${found ? '✅' : '❌'} Record just created ${found ? 'encontrado' : 'NOT found'} en la lista`);
    } else {
        console.log(`   ❌ Error ${mineRes.status}: ${JSON.stringify(mineData)}`);
    }

    // Probar sin auth → debe dar 401
    const noAuthRes = await fetch(`${API_URL}/v1/records/mine`);
    console.log(`   ${noAuthRes.status === 401 ? '✅' : '❌'} Sin auth → ${noAuthRes.status} (esperado 401)`);

    console.log('\n═══════════════════════════════════════════');
    console.log('  🎉 TEST COMPLETADO');
    console.log('═══════════════════════════════════════════\n');
    console.log('Resumen:');
    console.log(`  📝 Contenido hash: ${contentHash}`);
    console.log(`  💸 Fee tx: ${linksData.fee?.explorer_url ?? `https://sepolia.basescan.org/tx/${feeTxHash}`}`);
    console.log(`  📄 Record: ${linksData.links?.self ?? `${API_URL}/v1/records/${apiData.record_id}`}`);
    console.log(`  📋 Export: ${linksData.links?.export ?? `${API_URL}/v1/records/${apiData.record_id}/export`}`);
    if (anchored && anchoredData?.anchor) {
        console.log(`  ⛓️  Anchor: ${anchoredData.anchor.explorer_url}`);
    }
    console.log('');
}

main().catch((err) => {
    console.error('💥 Error fatal:', err.message || err);
    process.exit(1);
});
