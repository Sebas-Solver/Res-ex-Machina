import { describe, it, expect, vi, beforeAll } from 'vitest';

/**
 * Tests para src/utils/formatters.ts
 *
 * Verifica que las funciones de formateo generan la estructura correcta
 * y que buildLinks produce URLs auto-generadas válidas (Issue #20).
 */

// Mock env antes de importar formatters
vi.mock('../src/config/env.js', () => ({
    env: {
        PORT: 3000,
        L2_CHAIN_ID: 84532,
        FEE_RECEIVER_ADDRESS: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        API_BASE_URL: 'https://res-ex-machina-api.onrender.com',
    },
}));

import {
    buildAnchorBlock,
    buildFeeBlock,
    buildLinks,
    formatRecordResponse,
    formatFullExport,
    formatCompactExport,
} from '../src/utils/formatters.js';

// --- Fixture: record como lo devuelve la DB ---
const MOCK_RECORD = {
    recordId: '01936d8a-1234-7000-8000-000000000001',
    contentHash: 'sha256:' + 'ab'.repeat(32),
    contentType: 'text/plain',
    visibility: 'proof_only',
    pogBundle: {
        schema: 'pog.v1',
        content_hash: 'sha256:' + 'ab'.repeat(32),
        agent_wallet: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        model_id: 'gpt-4o',
        nonce: 'nonce-1234567890abcdef',
        signature: '0x' + 'ff'.repeat(65),
    },
    nonce: 'nonce-1234567890abcdef',
    agentWallet: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    state: 'anchored',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    receiptHash: 'sha256:' + 'cd'.repeat(32),
    tags: ['test'],
    externalRef: null,
    feeAmount: '0.01000000',
    feeCurrency: 'ETH',
    feeTxHash: '0x' + 'ee'.repeat(32),
    feeBlock: 37655640,
    feeConfirmedAt: new Date('2026-01-01T00:00:30.000Z'),
    anchorTxHash: '0x' + 'dd'.repeat(32),
    anchorBlock: 42,
    anchorChainId: 84532,
    anchoredAt: new Date('2026-01-01T00:01:00.000Z'),
} as any;

const MOCK_PENDING_RECORD = {
    ...MOCK_RECORD,
    state: 'pending_anchor',
    anchorTxHash: null,
    anchorBlock: null,
    anchorChainId: null,
    anchoredAt: null,
} as any;

// ============================================================
// buildAnchorBlock
// ============================================================
describe('buildAnchorBlock', () => {
    it('devuelve null si no hay anchorTxHash', () => {
        expect(buildAnchorBlock(MOCK_PENDING_RECORD)).toBeNull();
    });

    it('devuelve bloque anchor completo con explorer_url', () => {
        const anchor = buildAnchorBlock(MOCK_RECORD);
        expect(anchor).not.toBeNull();
        expect(anchor!.tx_hash).toBe(MOCK_RECORD.anchorTxHash);
        expect(anchor!.block).toBe(42);
        expect(anchor!.chain_id).toBe(84532);
        expect(anchor!.anchor_method).toBe('calldata');
        expect(anchor!.network_name).toBe('Base Sepolia');
        expect(anchor!.explorer_url).toContain('sepolia.basescan.org/tx/');
    });
});

// ============================================================
// buildFeeBlock
// ============================================================
describe('buildFeeBlock', () => {
    it('devuelve bloque fee con explorer_url', () => {
        const fee = buildFeeBlock(MOCK_RECORD);
        expect(fee.amount).toBe('0.01000000');
        expect(fee.currency).toBe('ETH');
        expect(fee.chain_id).toBe(84532);
        expect(fee.network_name).toBe('Base Sepolia');
        expect(fee.explorer_url).toContain('sepolia.basescan.org/tx/');
    });

    it('incluye block y confirmed_at cuando están disponibles (Issue #23)', () => {
        const fee = buildFeeBlock(MOCK_RECORD);
        expect(fee.block).toBe(37655640);
        expect(fee.confirmed_at).toBe('2026-01-01T00:00:30.000Z');
    });

    it('devuelve null para block y confirmed_at si no están disponibles', () => {
        const recordSinFeeBlock = { ...MOCK_RECORD, feeBlock: null, feeConfirmedAt: null } as any;
        const fee = buildFeeBlock(recordSinFeeBlock);
        expect(fee.block).toBeNull();
        expect(fee.confirmed_at).toBeNull();
    });
});

// ============================================================
// buildLinks (Issue #20)
// ============================================================
describe('buildLinks', () => {
    it('genera links self, export y verify correctos', () => {
        const links = buildLinks(MOCK_RECORD);

        expect(links.self).toBe(
            `https://res-ex-machina-api.onrender.com/v1/records/${MOCK_RECORD.recordId}`,
        );
        expect(links.export).toBe(
            `https://res-ex-machina-api.onrender.com/v1/records/${MOCK_RECORD.recordId}/export`,
        );
        expect(links.verify).toBe(
            `https://res-ex-machina-api.onrender.com/v1/records/verify?content_hash=${MOCK_RECORD.contentHash}`,
        );
    });

    it('usa localhost:PORT si API_BASE_URL no está definida', async () => {
        // Importar de nuevo con mock sin API_BASE_URL
        const { env } = await import('../src/config/env.js');
        const origUrl = env.API_BASE_URL;
        (env as any).API_BASE_URL = undefined;

        const links = buildLinks(MOCK_RECORD);
        expect(links.self).toContain('http://localhost:3000/v1/records/');

        // Restaurar
        (env as any).API_BASE_URL = origUrl;
    });
});

// ============================================================
// formatRecordResponse
// ============================================================
describe('formatRecordResponse', () => {
    it('incluye todos los campos esperados + links', () => {
        const response = formatRecordResponse(MOCK_RECORD);

        expect(response.record_id).toBe(MOCK_RECORD.recordId);
        expect(response.content_hash).toBe(MOCK_RECORD.contentHash);
        expect(response.state).toBe('anchored');
        expect(response.state_info).toBeDefined();
        expect(response.created_at).toBe('2026-01-01T00:00:00.000Z');
        expect(response.fee).toBeDefined();
        expect(response.anchor).not.toBeNull();
        expect(response.links).toBeDefined();
        expect(response.links.self).toContain(MOCK_RECORD.recordId);
    });

    it('anchor es null para records pending', () => {
        const response = formatRecordResponse(MOCK_PENDING_RECORD);
        expect(response.anchor).toBeNull();
        expect(response.links).toBeDefined();
    });
});

// ============================================================
// formatFullExport
// ============================================================
describe('formatFullExport', () => {
    it('incluye schema, verification, eip712_domain y links', () => {
        const exported = formatFullExport(MOCK_RECORD);

        expect(exported.schema).toBe('rex.receipt.v1');
        expect(exported.spec_version).toBe('1.2');
        expect(exported.verification).toBeDefined();
        expect(exported.verification.receipt_hash_algo).toBe('sha256');
        expect(exported.pog_bundle).toHaveProperty('eip712_domain');
        expect(exported.links).toBeDefined();
    });
});

// ============================================================
// formatCompactExport
// ============================================================
describe('formatCompactExport', () => {
    it('no incluye links (optimización de tokens)', () => {
        const compact = formatCompactExport(MOCK_RECORD);

        expect(compact.schema).toBe('rex.receipt.v1');
        expect(compact.record_id).toBe(MOCK_RECORD.recordId);
        expect(compact).not.toHaveProperty('links');
        expect(compact).not.toHaveProperty('visibility');
        expect(compact).not.toHaveProperty('content_type');
    });

    it('incluye solo campos esenciales del pog_bundle', () => {
        const compact = formatCompactExport(MOCK_RECORD);

        expect(compact.pog_bundle).toHaveProperty('agent_wallet');
        expect(compact.pog_bundle).toHaveProperty('nonce');
        expect(compact.pog_bundle).toHaveProperty('signature');
        expect(compact.pog_bundle).not.toHaveProperty('model_id');
    });
});
