/**
 * 🔍 Verificador de Receipts — Res ex Machina
 *
 * Verifica un receipt exportado de RxM de forma independiente:
 *   1. Recalcula el receipt_hash y compara
 *   2. Verifica la firma EIP-712 del PoG bundle
 *   3. Comprueba en blockchain que el anchored_hash está en el calldata
 *
 * Uso:
 *   npx tsx scripts/verify-receipt.ts <receipt.json | URL>
 *
 * Ejemplos:
 *   npx tsx scripts/verify-receipt.ts receipt.json
 *   npx tsx scripts/verify-receipt.ts https://res-ex-machina-api.onrender.com/v1/records/019c.../export
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
    createPublicClient,
    http,
    verifyTypedData,
    type Hex,
    type Address,
} from 'viem';
import { baseSepolia, mainnet } from 'viem/chains';

// ──────────────────────────────────────────────
// Chain RPC mapping
// ──────────────────────────────────────────────

const CHAIN_CONFIG: Record<number, { chain: any; rpcUrl: string; explorer: string }> = {
    84532: { chain: baseSepolia, rpcUrl: 'https://sepolia.base.org', explorer: 'https://sepolia.basescan.org' },
    8453: { chain: baseSepolia, rpcUrl: 'https://mainnet.base.org', explorer: 'https://basescan.org' },
    1: { chain: mainnet, rpcUrl: 'https://eth.llamarpc.com', explorer: 'https://etherscan.io' },
};

// ──────────────────────────────────────────────
// EIP-712 Types (must match server)
// ──────────────────────────────────────────────

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
// Types
// ──────────────────────────────────────────────

interface Receipt {
    schema: string;
    record_id: string;
    content_hash: string;
    content_type: string;
    visibility: string;
    pog_bundle: {
        schema: string;
        content_hash: string;
        agent_wallet: string;
        model_id: string;
        runtime_id: string;
        signature: string;
        timestamp: string;
        nonce: string;
        generation_process: {
            process_type: string;
            human_intervention_level: number;
            pipeline_steps: number;
        };
        eip712_domain?: {
            name: string;
            version: string;
            chain_id: number;
            verifying_contract: string;
        };
    };
    receipt_hash: string;
    verification?: {
        receipt_hash_algo: string;
        receipt_canonicalization: string;
        receipt_fields: string;
        eip712_primary_type: string;
    };
    created_at: string;
    state: string;
    fee: {
        amount: string;
        currency: string;
        tx_hash: string;
        chain_id?: number;
        to?: string;
    };
    anchor: {
        tx_hash: string;
        block: number;
        chain_id: number;
        anchored_at: string;
        anchored_hash?: string;
        anchor_method?: string;
    } | null;
}

// ──────────────────────────────────────────────
// Verification functions
// ──────────────────────────────────────────────

function verifyReceiptHash(receipt: Receipt): { ok: boolean; computed: string; expected: string } {
    const canonical = [
        receipt.record_id,
        receipt.content_hash,
        receipt.pog_bundle.agent_wallet.toLowerCase(),
        receipt.pog_bundle.nonce,
        receipt.created_at,
    ].join('|');

    const computed = `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
    return {
        ok: computed === receipt.receipt_hash,
        computed,
        expected: receipt.receipt_hash,
    };
}

async function verifySignature(receipt: Receipt): Promise<{ ok: boolean; signer: string; expected: string }> {
    const { pog_bundle } = receipt;

    // Use domain from receipt if available, otherwise use defaults
    const domain = pog_bundle.eip712_domain
        ? {
            name: pog_bundle.eip712_domain.name,
            version: pog_bundle.eip712_domain.version,
            chainId: pog_bundle.eip712_domain.chain_id,
            verifyingContract: pog_bundle.eip712_domain.verifying_contract as Address,
        }
        : {
            name: 'ResExMachina',
            version: '1',
            chainId: 0,
            verifyingContract: '0x0000000000000000000000000000000000000000' as Address,
        };

    const message = {
        schema: pog_bundle.schema,
        content_hash: pog_bundle.content_hash,
        agent_wallet: pog_bundle.agent_wallet as Address,
        model_id: pog_bundle.model_id,
        runtime_id: pog_bundle.runtime_id,
        process_type: pog_bundle.generation_process.process_type,
        human_intervention_level: pog_bundle.generation_process.human_intervention_level,
        pipeline_steps: pog_bundle.generation_process.pipeline_steps,
        timestamp: pog_bundle.timestamp,
        nonce: pog_bundle.nonce,
    };

    try {
        const isValid = await verifyTypedData({
            address: pog_bundle.agent_wallet as Address,
            domain,
            types: EIP712_TYPES,
            primaryType: 'PoGBundle',
            message,
            signature: pog_bundle.signature as Hex,
        });

        return {
            ok: isValid,
            signer: pog_bundle.agent_wallet,
            expected: pog_bundle.agent_wallet,
        };
    } catch {
        return {
            ok: false,
            signer: 'error: no se pudo verificar',
            expected: pog_bundle.agent_wallet,
        };
    }
}

async function verifyAnchor(receipt: Receipt): Promise<{ ok: boolean; detail: string }> {
    if (!receipt.anchor) {
        return { ok: false, detail: 'No hay datos de anchoring (estado: ' + receipt.state + ')' };
    }

    const chainId = receipt.anchor.chain_id;
    const config = CHAIN_CONFIG[chainId];

    if (!config) {
        return { ok: false, detail: `Chain ID ${chainId} no soportada para verificación` };
    }

    const client = createPublicClient({
        chain: config.chain,
        transport: http(config.rpcUrl),
    });

    try {
        const tx = await client.getTransaction({ hash: receipt.anchor.tx_hash as Hex });

        // Decode calldata from hex to UTF-8
        const calldataHex = tx.input;
        const calldataBytes = Buffer.from(calldataHex.slice(2), 'hex');
        const calldataText = calldataBytes.toString('utf-8');

        // The anchored hash we expect
        const expectedHash = receipt.anchor.anchored_hash || receipt.receipt_hash;

        if (calldataText === expectedHash) {
            return {
                ok: true,
                detail: `Calldata contiene "${expectedHash}" — bloque ${receipt.anchor.block}`,
            };
        } else {
            return {
                ok: false,
                detail: `Calldata = "${calldataText}" ≠ esperado "${expectedHash}"`,
            };
        }
    } catch (err: any) {
        return {
            ok: false,
            detail: `Error al consultar blockchain: ${err.message}`,
        };
    }
}

// ──────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────

async function main() {
    const input = process.argv[2];

    if (!input) {
        console.error('Uso: npx tsx scripts/verify-receipt.ts <receipt.json | URL>');
        console.error('');
        console.error('Ejemplos:');
        console.error('  npx tsx scripts/verify-receipt.ts receipt.json');
        console.error('  npx tsx scripts/verify-receipt.ts https://res-ex-machina-api.onrender.com/v1/records/ID/export');
        process.exit(1);
    }

    // Load receipt from file or URL
    let receipt: Receipt;
    if (input.startsWith('http')) {
        console.log(`\n📥 Descargando receipt desde ${input}...`);
        const res = await fetch(input);
        if (!res.ok) {
            console.error(`❌ Error ${res.status}: ${res.statusText}`);
            process.exit(1);
        }
        receipt = await res.json() as Receipt;
    } else {
        console.log(`\n📄 Leyendo receipt desde ${input}...`);
        receipt = JSON.parse(readFileSync(input, 'utf-8')) as Receipt;
    }

    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log('  🔍 Verificador de Receipts — RxM');
    console.log('═══════════════════════════════════════════');
    console.log('');
    console.log(`  Record:  ${receipt.record_id}`);
    console.log(`  Schema:  ${receipt.schema}`);
    console.log(`  Estado:  ${receipt.state}`);
    console.log(`  Fecha:   ${receipt.created_at}`);
    console.log(`  Wallet:  ${receipt.pog_bundle.agent_wallet}`);
    console.log('');
    console.log('───────────────────────────────────────────');

    let allPassed = true;

    // 1. Verify receipt_hash
    console.log('\n1️⃣  Verificando receipt_hash...');
    const hashResult = verifyReceiptHash(receipt);
    if (hashResult.ok) {
        console.log(`   ✅ VÁLIDO — hash recalculado coincide`);
        console.log(`      ${hashResult.computed}`);
    } else {
        console.log(`   ❌ INVÁLIDO — hash no coincide`);
        console.log(`      Esperado:  ${hashResult.expected}`);
        console.log(`      Calculado: ${hashResult.computed}`);
        allPassed = false;
    }

    // 2. Verify EIP-712 signature
    console.log('\n2️⃣  Verificando firma EIP-712...');
    const sigResult = await verifySignature(receipt);
    if (sigResult.ok) {
        console.log(`   ✅ VÁLIDA — firmado por ${sigResult.signer}`);
    } else {
        console.log(`   ❌ INVÁLIDA — ${sigResult.signer}`);
        allPassed = false;
    }

    // 3. Verify anchor on-chain
    console.log('\n3️⃣  Verificando anchoring en blockchain...');
    const anchorResult = await verifyAnchor(receipt);
    if (anchorResult.ok) {
        console.log(`   ✅ CONFIRMADO — ${anchorResult.detail}`);
        if (receipt.anchor) {
            const config = CHAIN_CONFIG[receipt.anchor.chain_id];
            if (config) {
                console.log(`      🔗 ${config.explorer}/tx/${receipt.anchor.tx_hash}`);
            }
        }
    } else {
        console.log(`   ⚠️  ${anchorResult.detail}`);
        if (receipt.state !== 'anchored') {
            console.log(`      (El record aún no ha sido anclado)`);
        } else {
            allPassed = false;
        }
    }

    // Verdict
    console.log('\n═══════════════════════════════════════════');
    if (allPassed) {
        console.log('  📋 Veredicto: ✅ RECORD AUTÉNTICO');
    } else {
        console.log('  📋 Veredicto: ❌ VERIFICACIÓN FALLIDA');
    }
    console.log('═══════════════════════════════════════════\n');

    process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
    console.error('💥 Error fatal:', err.message || err);
    process.exit(1);
});
