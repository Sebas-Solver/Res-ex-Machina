/**
 * 🧪 Test E2E — Res ex Machina Alpha
 *
 * Este script ejecuta el flujo completo de registro de un contenido:
 *   1. Genera un contenido de prueba y calcula su hash SHA-256
 *   2. Envía la transacción de fee al fee receiver en Base Sepolia
 *   3. Firma el PoG bundle con EIP-712
 *   4. Llama a POST /v1/records en la API pública
 *   5. Consulta el record para verificar el resultado
 *
 * Uso:
 *   npx tsx scripts/test-alpha.ts
 *
 * Requiere la variable TEST_AGENT_PRIVATE_KEY (clave privada de la wallet del agente).
 * Se puede poner en .env o pasar por línea de comandos.
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
const FEE_AMOUNT = 0.0002; // ETH (mínimo en Render es 0.0001)

const AGENT_PRIVATE_KEY = process.env.TEST_AGENT_PRIVATE_KEY;
if (!AGENT_PRIVATE_KEY) {
    console.error('❌ Falta TEST_AGENT_PRIVATE_KEY en .env');
    console.error('   Añade esta línea a tu .env:');
    console.error('   TEST_AGENT_PRIVATE_KEY=0xTU_CLAVE_PRIVADA_DEL_AGENTE');
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

    // ── Paso 0: Verificar que la API está viva ──
    console.log('📡 Paso 0: Verificando que la API está online...');
    const healthRes = await fetch(`${API_URL}/v1/health`);
    const health = await healthRes.json();
    if (health.status !== 'ok') {
        console.error('❌ La API no está sana:', health);
        process.exit(1);
    }
    console.log(`   ✅ API OK (DB: ${health.checks.database.latencyMs}ms, Redis: ${health.checks.redis.latencyMs}ms, Blockchain: ${health.checks.blockchain.latencyMs}ms)\n`);

    // ── Paso 1: Generar contenido de prueba ──
    console.log('📝 Paso 1: Generando contenido de prueba...');
    const testContent = `Este es un contenido de prueba generado por IA. Timestamp: ${new Date().toISOString()}. Random: ${Math.random()}`;
    const contentHash = sha256(testContent);
    console.log(`   Contenido: "${testContent.substring(0, 60)}..."`);
    console.log(`   Hash: ${contentHash}\n`);

    // ── Paso 2: Verificar balance ──
    console.log('💰 Paso 2: Verificando balance del agente...');
    const balance = await publicClient.getBalance({ address: account.address });
    const balanceEth = parseFloat(formatEther(balance));
    console.log(`   Balance: ${balanceEth.toFixed(6)} ETH`);
    if (balanceEth < FEE_AMOUNT + 0.0001) { // fee + gas
        console.error(`   ❌ Balance insuficiente. Necesitas al menos ${FEE_AMOUNT + 0.0001} ETH`);
        console.error('   Consigue ETH en: https://www.alchemy.com/faucets/base-sepolia');
        process.exit(1);
    }
    console.log(`   ✅ Balance suficiente\n`);

    // ── Paso 3: Enviar transacción de fee ──
    console.log(`💸 Paso 3: Enviando fee de ${FEE_AMOUNT} ETH a ${FEE_RECEIVER}...`);
    const feeValue = BigInt(Math.round(FEE_AMOUNT * 1e18));
    const feeTxHash = await walletClient.sendTransaction({
        to: FEE_RECEIVER,
        value: feeValue,
    });
    console.log(`   📤 Tx enviada: ${feeTxHash}`);
    console.log('   ⏳ Esperando confirmación...');

    const feeReceipt = await publicClient.waitForTransactionReceipt({ hash: feeTxHash });
    console.log(`   ✅ Confirmada en bloque ${feeReceipt.blockNumber}\n`);

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
        console.log(`   Receipt hash: ${apiData.receipt_hash}\n`);
    } else {
        console.error(`   ❌ Error ${apiRes.status}:`, JSON.stringify(apiData, null, 2));
        process.exit(1);
    }

    // ── Paso 6: Esperar y verificar anchoring ──
    console.log('⚓ Paso 6: Esperando anchoring (puede tardar ~30 seg)...');
    let anchored = false;
    for (let i = 0; i < 12; i++) {
        await sleep(5000);
        const checkRes = await fetch(`${API_URL}/v1/records/${apiData.record_id}`);
        const checkData = await checkRes.json();
        console.log(`   [${(i + 1) * 5}s] Estado: ${checkData.state}`);

        if (checkData.state === 'anchored') {
            anchored = true;
            console.log(`\n   ✅ ¡ANCLADO EN BLOCKCHAIN!`);
            console.log(`   🔗 Tx: https://sepolia.basescan.org/tx/${checkData.anchor.tx_hash}`);
            console.log(`   📦 Bloque: ${checkData.anchor.block}`);
            console.log(`   ⛓️  Chain ID: ${checkData.anchor.chain_id}`);
            break;
        } else if (checkData.state === 'anchor_failed') {
            console.error(`\n   ❌ Anchoring falló`);
            break;
        }
    }

    if (!anchored) {
        console.log(`\n   ⏳ El anchoring aún no se ha completado. Puedes revisar manualmente:`);
        console.log(`   ${API_URL}/v1/records/${apiData.record_id}`);
    }

    // ── Paso 7: Exportar receipt ──
    console.log('\n📋 Paso 7: Exportando receipt verificable...');
    const exportRes = await fetch(`${API_URL}/v1/records/${apiData.record_id}/export`);
    const receipt = await exportRes.json();
    console.log(JSON.stringify(receipt, null, 2));

    // ── Paso 8: Verificar por content_hash ──
    console.log('\n🔍 Paso 8: Verificando por content_hash...');
    const verifyRes = await fetch(`${API_URL}/v1/records/verify?content_hash=${contentHash}`);
    const verifyData = await verifyRes.json();
    console.log(`   ✅ Record encontrado: ${verifyData.exists}`);
    console.log(`   Record ID: ${verifyData.record_id}`);
    console.log(`   Estado: ${verifyData.state}`);

    console.log('\n═══════════════════════════════════════════');
    console.log('  🎉 TEST COMPLETADO');
    console.log('═══════════════════════════════════════════\n');
    console.log('Resumen:');
    console.log(`  📝 Contenido hash: ${contentHash}`);
    console.log(`  💸 Fee tx: https://sepolia.basescan.org/tx/${feeTxHash}`);
    console.log(`  📄 Record: ${API_URL}/v1/records/${apiData.record_id}`);
    console.log(`  📋 Export: ${API_URL}/v1/records/${apiData.record_id}/export`);
    if (anchored) {
        console.log(`  ⛓️  Anchor: https://sepolia.basescan.org/tx/${(await (await fetch(`${API_URL}/v1/records/${apiData.record_id}`)).json()).anchor?.tx_hash}`);
    }
    console.log('');
}

main().catch((err) => {
    console.error('💥 Error fatal:', err.message || err);
    process.exit(1);
});
