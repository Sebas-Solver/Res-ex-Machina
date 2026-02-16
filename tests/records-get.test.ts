import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import recordRoutes from '../src/routes/records.js';
import { apiErrorHandler } from '../src/utils/errors.js';

/**
 * Tests de integración para los endpoints GET de /v1/records.
 *
 * Skills aplicadas:
 * - javascript-testing-patterns: vi.mock, inject pattern
 * - web3-testing: fixtures de datos, edge cases
 *
 * Estrategia: Mockeamos la capa de DB (drizzle) para no necesitar
 * una DB real. Testeamos la lógica de los handlers + error handling.
 */

// --- Fixture: record completo como lo devuelve la DB ---
const MOCK_RECORD = {
    recordId: '01936d8a-1234-7000-8000-000000000001',
    contentHash: 'sha256:' + 'ab'.repeat(32),
    contentType: 'text/plain',
    visibility: 'proof_only',
    pogBundle: {
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
    },
    nonce: 'nonce-1234567890abcdef',
    agentWallet: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    state: 'anchored',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    receiptHash: 'sha256:' + 'cd'.repeat(32),
    tags: ['test', 'demo'],
    externalRef: null,
    feeAmount: '0.01000000',
    feeCurrency: 'MATIC',
    feeTxHash: '0x' + 'ee'.repeat(32),
    anchorTxHash: '0x' + 'dd'.repeat(32),
    anchorBlock: 42,
    anchorChainId: 31337,
    anchorErrorReason: null,
    anchorRetries: 0,
    anchoredAt: new Date('2026-01-01T00:05:00.000Z'),
};

// --- Mock de drizzle DB ---
// Simulamos la cadena: db.select().from().where().limit()
let mockDbResult: any[] = [];

const mockLimit = vi.fn(() => mockDbResult);
const mockWhere = vi.fn(() => ({ limit: mockLimit }));
const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));

vi.mock('../src/db/index.js', () => ({
    db: {
        select: () => mockSelect(),
    },
}));

vi.mock('../src/db/schema.js', () => ({
    records: {
        recordId: 'record_id',
        contentHash: 'content_hash',
        state: 'state',
    },
}));

// --- App Fastify para cada test ---
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

// =============================================
// GET /v1/records/:id
// =============================================
describe('GET /v1/records/:id', () => {
    it('devuelve 200 con record completo si existe', async () => {
        mockDbResult = [MOCK_RECORD];

        const res = await app.inject({
            method: 'GET',
            url: '/v1/records/01936d8a-1234-7000-8000-000000000001',
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.record_id).toBe('01936d8a-1234-7000-8000-000000000001');
        expect(body.content_hash).toBe(MOCK_RECORD.contentHash);
        expect(body.state).toBe('anchored');
        expect(body.fee.amount).toBe('0.01000000');
        expect(body.fee.currency).toBe('MATIC');
        expect(body.anchor).not.toBeNull();
        expect(body.anchor.tx_hash).toBe(MOCK_RECORD.anchorTxHash);
        expect(body.anchor.block).toBe(42);
    });

    it('devuelve 400 invalid_record_id si UUID inválido', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/records/not-a-uuid',
        });

        expect(res.statusCode).toBe(400);
        expect(res.json().error.code).toBe('invalid_record_id');
    });

    it('devuelve 404 si record no existe', async () => {
        mockDbResult = [];

        const res = await app.inject({
            method: 'GET',
            url: '/v1/records/01936d8a-1234-7000-8000-999999999999',
        });

        expect(res.statusCode).toBe(404);
        expect(res.json().error.code).toBe('record_not_found');
    });

    it('devuelve anchor: null si record no está anchored', async () => {
        const pendingRecord = {
            ...MOCK_RECORD,
            state: 'pending_anchor',
            anchorTxHash: null,
            anchorBlock: null,
            anchorChainId: null,
            anchoredAt: null,
        };
        mockDbResult = [pendingRecord];

        const res = await app.inject({
            method: 'GET',
            url: '/v1/records/01936d8a-1234-7000-8000-000000000001',
        });

        expect(res.statusCode).toBe(200);
        expect(res.json().anchor).toBeNull();
        expect(res.json().state).toBe('pending_anchor');
    });
});

// =============================================
// GET /v1/records/verify?content_hash=
// =============================================
describe('GET /v1/records/verify', () => {
    it('devuelve exists: true si content_hash existe', async () => {
        mockDbResult = [MOCK_RECORD];
        const hash = 'sha256:' + 'ab'.repeat(32);

        const res = await app.inject({
            method: 'GET',
            url: `/v1/records/verify?content_hash=${hash}`,
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.exists).toBe(true);
        expect(body.record_id).toBe(MOCK_RECORD.recordId);
        expect(body.state).toBe('anchored');
        expect(body.receipt_hash).toBe(MOCK_RECORD.receiptHash);
    });

    it('devuelve 400 si content_hash falta', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/records/verify',
        });

        expect(res.statusCode).toBe(400);
        expect(res.json().error.code).toBe('invalid_content_hash');
    });

    it('devuelve 400 si content_hash no tiene formato sha256:', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/records/verify?content_hash=md5:abc123',
        });

        expect(res.statusCode).toBe(400);
        expect(res.json().error.code).toBe('invalid_content_hash');
    });

    it('devuelve 400 si hash tiene caracteres inválidos', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/records/verify?content_hash=sha256:' + 'GG'.repeat(32),
        });

        expect(res.statusCode).toBe(400);
        expect(res.json().error.code).toBe('invalid_content_hash');
    });

    it('devuelve 404 si content_hash no existe', async () => {
        mockDbResult = [];

        const res = await app.inject({
            method: 'GET',
            url: '/v1/records/verify?content_hash=sha256:' + '00'.repeat(32),
        });

        expect(res.statusCode).toBe(404);
        expect(res.json().error.code).toBe('record_not_found');
    });
});

// =============================================
// GET /v1/records/:id/export
// =============================================
describe('GET /v1/records/:id/export', () => {
    it('devuelve receipt completo con schema rex.receipt.v1', async () => {
        mockDbResult = [MOCK_RECORD];

        const res = await app.inject({
            method: 'GET',
            url: '/v1/records/01936d8a-1234-7000-8000-000000000001/export',
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.schema).toBe('rex.receipt.v1');
        expect(body.record_id).toBe(MOCK_RECORD.recordId);
        expect(body.pog_bundle).toBeDefined();
        expect(body.pog_bundle.schema).toBe('pog.v1');
        expect(body.fee.amount).toBe('0.01000000');
        expect(body.fee.tx_hash).toBe(MOCK_RECORD.feeTxHash);
        expect(body.anchor).not.toBeNull();
        expect(body.anchor.chain_id).toBe(31337);
    });

    it('devuelve anchor: null si pending_anchor', async () => {
        const pendingRecord = {
            ...MOCK_RECORD,
            state: 'pending_anchor',
            anchorTxHash: null,
            anchorBlock: null,
            anchorChainId: null,
            anchoredAt: null,
        };
        mockDbResult = [pendingRecord];

        const res = await app.inject({
            method: 'GET',
            url: '/v1/records/01936d8a-1234-7000-8000-000000000001/export',
        });

        expect(res.statusCode).toBe(200);
        expect(res.json().anchor).toBeNull();
    });

    it('devuelve 400 si UUID inválido', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/records/bad-id/export',
        });

        expect(res.statusCode).toBe(400);
        expect(res.json().error.code).toBe('invalid_record_id');
    });

    it('devuelve 404 si record no existe', async () => {
        mockDbResult = [];

        const res = await app.inject({
            method: 'GET',
            url: '/v1/records/01936d8a-1234-7000-8000-999999999999/export',
        });

        expect(res.statusCode).toBe(404);
        expect(res.json().error.code).toBe('record_not_found');
    });
});

// =============================================
// DX Features: state_info, explorer_url, compact
// =============================================
describe('DX: state_info en respuestas', () => {
    it('GET /:id incluye state_info con terminal/retryable/description', async () => {
        mockDbResult = [MOCK_RECORD];

        const res = await app.inject({
            method: 'GET',
            url: '/v1/records/01936d8a-1234-7000-8000-000000000001',
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.state_info).toBeDefined();
        expect(body.state_info.terminal).toBe(true);
        expect(body.state_info.retryable).toBe(false);
        expect(typeof body.state_info.description).toBe('string');
    });

    it('verify incluye state_info', async () => {
        mockDbResult = [MOCK_RECORD];
        const hash = 'sha256:' + 'ab'.repeat(32);

        const res = await app.inject({
            method: 'GET',
            url: `/v1/records/verify?content_hash=${hash}`,
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.state_info).toBeDefined();
        expect(body.state_info.terminal).toBe(true);
    });

    it('export incluye state_info', async () => {
        mockDbResult = [MOCK_RECORD];

        const res = await app.inject({
            method: 'GET',
            url: '/v1/records/01936d8a-1234-7000-8000-000000000001/export',
        });

        const body = res.json();
        expect(body.state_info).toBeDefined();
        expect(body.state_info.terminal).toBe(true);
    });
});

describe('DX: modo compact en export', () => {
    it('mode=compact incluye solo campos de verificación', async () => {
        mockDbResult = [MOCK_RECORD];

        const res = await app.inject({
            method: 'GET',
            url: '/v1/records/01936d8a-1234-7000-8000-000000000001/export?mode=compact',
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();

        // Campos que SÍ deben estar
        expect(body.schema).toBe('rex.receipt.v1');
        expect(body.spec_version).toBe('1.2');
        expect(body.record_id).toBeDefined();
        expect(body.content_hash).toBeDefined();
        expect(body.receipt_hash).toBeDefined();
        expect(body.state).toBeDefined();
        expect(body.state_info).toBeDefined();
        expect(body.verification).toBeDefined();
        expect(body.pog_bundle.signature).toBeDefined();
        expect(body.pog_bundle.agent_wallet).toBeDefined();
        expect(body.anchor).toBeDefined();

        // Campos que NO deben estar en compact
        expect(body.content_type).toBeUndefined();
        expect(body.visibility).toBeUndefined();
        expect(body.fee).toBeUndefined();
        expect(body.pog_bundle.eip712_domain).toBeUndefined();
        expect(body.pog_bundle.runtime_id).toBeUndefined();
        expect(body.pog_bundle.model_id).toBeUndefined();
    });

    it('mode=full (default) incluye todos los campos', async () => {
        mockDbResult = [MOCK_RECORD];

        const res = await app.inject({
            method: 'GET',
            url: '/v1/records/01936d8a-1234-7000-8000-000000000001/export',
        });

        const body = res.json();
        expect(body.content_type).toBeDefined();
        expect(body.visibility).toBeDefined();
        expect(body.fee).toBeDefined();
        expect(body.pog_bundle.eip712_domain).toBeDefined();
    });
});
