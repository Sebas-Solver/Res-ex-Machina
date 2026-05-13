// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import recordRoutes from '../src/routes/records.js';
import { apiErrorHandler } from '../src/utils/errors.js';

/**
 * Tests de invariantes del sistema (Issue #9).
 *
 * Validan los invariantes definidos en invariants.yml:
 * - INV-001: Records permanentes (no DELETE)
 * - INV-003: Content hash sha256 obligatorio
 * - INV-005: Valid EIP-712 signature required
 * - INV-012: Fee verificado on-chain
 * - INV-014: Nonce unique por wallet
 * - INV-016: Content hash unique (idempotencia)
 *
 * Estrategia: Fastify inject + vi.mock de todas las dependencias.
 */

// --- Mock env.ts FIRST to prevent process.exit(1) ---
vi.mock('../src/config/env.js', () => ({
    env: {
        PORT: 3000,
        NODE_ENV: 'test',
        LOG_LEVEL: 'info',
        DATABASE_URL: 'postgres://test:test@localhost:5432/test',
        REDIS_URL: 'redis://localhost:6379',
        L2_RPC_URL: 'http://localhost:8545',
        L2_CHAIN_ID: 31337,
        FEE_RECEIVER_ADDRESS: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        FEE_MINIMUM_AMOUNT: 0.01,
        FEE_TX_MAX_AGE_HOURS: 24,
        ANCHOR_WALLET_PRIVATE_KEY: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    },
}));

// --- Mocks de servicios ---
const mockVerifyPoGSignature = vi.fn();
const mockVerifyFee = vi.fn();
const mockEnqueueAnchorJob = vi.fn();

// Mocks para las queries de idempotencia
let mockSelectResults: any[] = [];

vi.mock('../src/services/signature.js', () => ({
    verifyPoGSignature: (...args: unknown[]) => mockVerifyPoGSignature(...args),
}));

vi.mock('../src/services/fee.js', () => ({
    verifyFee: (...args: unknown[]) => mockVerifyFee(...args),
}));

vi.mock('../src/services/queue.js', () => ({
    enqueueAnchorJob: (...args: unknown[]) => mockEnqueueAnchorJob(...args),
}));

vi.mock('../src/services/receipt.js', () => ({
    computeReceiptHash: () => 'sha256:' + 'ab'.repeat(32),
}));

vi.mock('../src/utils/uuid.js', () => ({
    generateRecordId: () => '01936d8a-1234-7000-8000-000000000001',
}));

// Mock de drizzle DB
const mockReturning = vi.fn(() => [{ id: 'mock-id', record_id: 'mock-record-id', state: 'pending_anchor', receipt_hash: 'sha256:abcd', created_at: new Date().toISOString() }]);
const mockLimit = vi.fn(() => mockSelectResults);
const mockWhere = vi.fn(() => ({ limit: mockLimit, returning: mockReturning }));
const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));

const mockValues = vi.fn(() => ({ returning: mockReturning }));
const mockDbInsert = vi.fn(() => ({ values: mockValues }));

const mockSet = vi.fn(() => ({ where: mockWhere }));
const mockUpdate = vi.fn(() => ({ set: mockSet }));

vi.mock('../src/db/index.js', () => ({
    db: {
        select: () => mockSelect(),
        insert: () => mockDbInsert(),
        update: () => mockUpdate(),
    },
}));

vi.mock('../src/db/schema.js', () => ({
    records: {
        recordId: 'record_id',
        contentHash: 'content_hash',
        agentWallet: 'agent_wallet',
        nonce: 'nonce',
        feeTxHash: 'fee_tx_hash',
        state: 'state',
    },
    paymentAttempts: {
        id: 'id',
    }
}));

// --- App Fastify ---
let app: FastifyInstance;

beforeAll(async () => {
    app = Fastify({ logger: false });
    app.setErrorHandler(apiErrorHandler);
    await app.register(recordRoutes, { prefix: '/v1/records' });
    await app.ready();
});

afterAll(async () => {
    await app.close();
});

// --- Fixture: valid PoG bundle ---
const VALID_POG_BUNDLE = {
    schema: 'pog.v1',
    content_hash: 'sha256:' + 'ab'.repeat(32),
    agent_wallet: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    model_id: 'openai:gpt-4o:2026-01',
    runtime_id: 'node-22.x',
    generation_process: {
        process_type: 'direct',
        human_intervention_level: 0,
        pipeline_steps: 1,
    },
    timestamp: '2026-01-01T00:00:00.000Z',
    nonce: 'nonce-1234567890abcdef',
    signature: '0x' + 'ff'.repeat(65),
};

const VALID_POST_BODY = {
    pog_bundle: VALID_POG_BUNDLE,
    visibility: 'proof_only',
    fee_amount: 0.01,
    fee_currency: 'MATIC',
    fee_tx_hash: '0x' + 'ee'.repeat(32),
    content_type: 'text/plain',
};

// =============================================
// INV-001: Records permanentes (no DELETE)
// =============================================
describe('INV-001: DELETE no permitido', () => {
    it('DELETE /v1/records/:id → 404 (ruta no existe)', async () => {
        const res = await app.inject({
            method: 'DELETE',
            url: '/v1/records/01936d8a-1234-7000-8000-000000000001',
        });

        // Fastify devuelve 404 para rutas que no existen
        expect(res.statusCode).toBe(404);
    });
});

// =============================================
// INV-003: Content hash formato sha256
// =============================================
describe('INV-003: Valid content hash', () => {
    it('POST con content_hash malformado → 400', async () => {
        const body = {
            ...VALID_POST_BODY,
            pog_bundle: {
                ...VALID_POG_BUNDLE,
                content_hash: 'md5:abc123',
            },
        };

        const res = await app.inject({
            method: 'POST',
            url: '/v1/records',
            payload: body,
        });

        expect(res.statusCode).toBe(400);
        expect(res.json().error.code).toBe('invalid_pog_schema');
    });

    it('POST sin content_hash → 400', async () => {
        const bundle = { ...VALID_POG_BUNDLE };
        delete (bundle as any).content_hash;

        const res = await app.inject({
            method: 'POST',
            url: '/v1/records',
            payload: { ...VALID_POST_BODY, pog_bundle: bundle },
        });

        expect(res.statusCode).toBe(400);
    });
});

// =============================================
// INV-005: Firma EIP-712 obligatoria
// =============================================
describe('INV-005: Firma EIP-712', () => {
    it('POST with invalid signature → 401', async () => {
        const { ApiError } = await import('../src/utils/errors.js');
        mockVerifyPoGSignature.mockRejectedValue(
            new ApiError(401, 'invalid_signature', 'Bad signature'),
        );
        mockSelectResults = [];

        const res = await app.inject({
            method: 'POST',
            url: '/v1/records',
            payload: VALID_POST_BODY,
        });

        expect(res.statusCode).toBe(401);
        expect(res.json().error.code).toBe('invalid_signature');
    });

    it('POST con signer ≠ agent_wallet → 401', async () => {
        const { ApiError } = await import('../src/utils/errors.js');
        mockVerifyPoGSignature.mockRejectedValue(
            new ApiError(401, 'signer_mismatch', 'Signer mismatch'),
        );
        mockSelectResults = [];

        const res = await app.inject({
            method: 'POST',
            url: '/v1/records',
            payload: VALID_POST_BODY,
        });

        expect(res.statusCode).toBe(401);
        expect(res.json().error.code).toBe('signer_mismatch');
    });

    it('POST sin firma (sin campo signature) → 400', async () => {
        const bundle = { ...VALID_POG_BUNDLE };
        delete (bundle as any).signature;

        const res = await app.inject({
            method: 'POST',
            url: '/v1/records',
            payload: { ...VALID_POST_BODY, pog_bundle: bundle },
        });

        expect(res.statusCode).toBe(400);
    });
});

// =============================================
// INV-012: Fee verificado on-chain
// =============================================
describe('INV-012: Fee verification', () => {
    it('POST sin fee_tx_hash → 400', async () => {
        mockVerifyPoGSignature.mockResolvedValue(undefined);
        const body = { ...VALID_POST_BODY };
        delete (body as any).fee_tx_hash;

        const res = await app.inject({
            method: 'POST',
            url: '/v1/records',
            payload: body,
        });

        expect(res.statusCode).toBe(400);
    });

    it('POST con fee no verificado → 402', async () => {
        const { ApiError } = await import('../src/utils/errors.js');
        mockVerifyPoGSignature.mockResolvedValue(undefined);
        mockVerifyFee.mockRejectedValue(
            new ApiError(402, 'fee_not_verified', 'Fee not found'),
        );
        mockSelectResults = [];

        const res = await app.inject({
            method: 'POST',
            url: '/v1/records',
            payload: VALID_POST_BODY,
        });

        expect(res.statusCode).toBe(402);
        expect(res.json().error.code).toBe('fee_not_verified');
    });

    it('POST con fee insuficiente → 402', async () => {
        const { ApiError } = await import('../src/utils/errors.js');
        mockVerifyPoGSignature.mockResolvedValue(undefined);
        mockVerifyFee.mockRejectedValue(
            new ApiError(402, 'fee_insufficient', 'Fee too low'),
        );
        mockSelectResults = [];

        const res = await app.inject({
            method: 'POST',
            url: '/v1/records',
            payload: VALID_POST_BODY,
        });

        expect(res.statusCode).toBe(402);
        expect(res.json().error.code).toBe('fee_insufficient');
    });
});

// =============================================
// INV-014: Nonce unique por wallet
// =============================================
describe('INV-014: Nonce unique', () => {
    it('POST con nonce duplicado por wallet → 409', async () => {
        mockVerifyPoGSignature.mockResolvedValue(undefined);
        mockVerifyFee.mockResolvedValue({ verified: true, amount: '0.01', recipient: '0x...', blockNumber: 1n });
        // Primera query (content_hash) → no existe
        // Segunda query (nonce) → ya existe
        let queryCount = 0;
        mockLimit.mockImplementation(() => {
            queryCount++;
            if (queryCount === 1) return []; // content_hash no duplicado
            if (queryCount === 2) return [{ recordId: 'existing' }]; // nonce duplicado
            return [];
        });

        const res = await app.inject({
            method: 'POST',
            url: '/v1/records',
            payload: VALID_POST_BODY,
        });

        expect(res.statusCode).toBe(409);
        expect(res.json().error.code).toBe('duplicate_nonce');

        // Reset
        mockLimit.mockImplementation(() => mockSelectResults);
        mockSelectResults = [];
    });
});

// =============================================
// INV-016: Content hash unique (idempotencia)
// =============================================
describe('INV-016: Content hash unique', () => {
    it('POST con content_hash duplicado → 409', async () => {
        mockVerifyPoGSignature.mockResolvedValue(undefined);
        mockVerifyFee.mockResolvedValue({ verified: true, amount: '0.01', recipient: '0x...', blockNumber: 1n });
        // Primera query (content_hash) → ya existe
        let queryCount = 0;
        mockLimit.mockImplementation(() => {
            queryCount++;
            if (queryCount === 1) return [{ recordId: 'existing' }]; // content_hash duplicado
            return [];
        });

        const res = await app.inject({
            method: 'POST',
            url: '/v1/records',
            payload: VALID_POST_BODY,
        });

        expect(res.statusCode).toBe(409);
        expect(res.json().error.code).toBe('duplicate_content_hash');

        // Reset
        mockLimit.mockImplementation(() => mockSelectResults);
        mockSelectResults = [];
    });
});

// =============================================
// POST exitoso — flujo completo
// =============================================
describe('POST /v1/records — flujo exitoso', () => {
    it('valid POST → 201 with record_id and receipt_hash', async () => {
        mockVerifyPoGSignature.mockResolvedValue(undefined);
        mockVerifyFee.mockResolvedValue({ verified: true, amount: '0.01', recipient: '0x...', blockNumber: 1n });
        mockEnqueueAnchorJob.mockResolvedValue(undefined);
        mockSelectResults = [];

        const res = await app.inject({
            method: 'POST',
            url: '/v1/records',
            payload: VALID_POST_BODY,
        });

        expect(res.statusCode).toBe(201);
        const body = res.json();
        expect(body.record_id).toBeDefined();
        expect(body.state).toBe('pending_anchor');
        expect(body.receipt_hash).toMatch(/^sha256:/);
        expect(body.created_at).toBeDefined();
    });
});

// =============================================
// GET endpoints — ya cubiertos en records-get.test.ts
// Here we only validate the key invariants
// =============================================
describe('Invariantes GET', () => {
    it('GET record existente → 200', async () => {
        const mockRecord = {
            recordId: '01936d8a-1234-7000-8000-000000000001',
            contentHash: 'sha256:' + 'ab'.repeat(32),
            contentType: 'text/plain',
            visibility: 'proof_only',
            pogBundle: VALID_POG_BUNDLE,
            nonce: 'nonce-1234567890abcdef',
            agentWallet: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
            state: 'anchored',
            createdAt: new Date(),
            receiptHash: 'sha256:' + 'cd'.repeat(32),
            tags: [],
            externalRef: null,
            feeAmount: '0.01000000',
            feeCurrency: 'MATIC',
            feeTxHash: '0x' + 'ee'.repeat(32),
            anchorTxHash: '0x' + 'dd'.repeat(32),
            anchorBlock: 42,
            anchorChainId: 31337,
            anchorErrorReason: null,
            anchorRetries: 0,
            anchoredAt: new Date(),
        };
        // Ensure mockLimit returns the record for GET queries
        mockLimit.mockImplementation(() => [mockRecord]);
        mockSelectResults = [mockRecord];

        const res = await app.inject({
            method: 'GET',
            url: '/v1/records/01936d8a-1234-7000-8000-000000000001',
        });

        expect(res.statusCode).toBe(200);
        expect(res.json().record_id).toBeDefined();

        // Reset
        mockLimit.mockImplementation(() => mockSelectResults);
        mockSelectResults = [];
    });

    it('GET record inexistente → 404', async () => {
        mockSelectResults = [];

        const res = await app.inject({
            method: 'GET',
            url: '/v1/records/01936d8a-1234-7000-8000-999999999999',
        });

        expect(res.statusCode).toBe(404);
        expect(res.json().error.code).toBe('record_not_found');
    });
});
