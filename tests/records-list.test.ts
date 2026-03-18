import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import recordRoutes from '../src/routes/records.js';
import { apiErrorHandler } from '../src/utils/errors.js';

/**
 * Tests para GET /v1/records (Issue #21).
 *
 * Estrategia: Mockeamos la capa de DB (drizzle) y testeamos
 * the handler logic + query params validation + formatting.
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
        agent_wallet: '0xDd688C11a20e1aDa37CC4A6e4492D5A22bE23A47',
        model_id: 'openai:gpt-4:2026-01',
        runtime_id: 'node-22.x',
        generation_process: {
            process_type: 'direct',
            human_intervention_level: 0,
            pipeline_steps: 1,
        },
        timestamp: '2026-01-01T00:00:00.000Z',
        nonce: 'test-nonce-1234567890',
        signature: '0x' + 'ab'.repeat(65),
    },
    nonce: 'test-nonce-1234567890',
    agentWallet: '0xDd688C11a20e1aDa37CC4A6e4492D5A22bE23A47',
    state: 'anchored',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    receiptHash: 'sha256:' + 'cd'.repeat(32),
    tags: ['test', 'alpha'],
    externalRef: null,
    feeAmount: '0.00100000',
    feeCurrency: 'MATIC',
    feeTxHash: '0x' + 'ff'.repeat(32),
    feeBlock: 12345678,
    feeConfirmedAt: new Date('2026-01-01T00:01:00.000Z'),
    anchorTxHash: '0x' + 'ee'.repeat(32),
    anchorBlock: 12345700,
    anchorChainId: 80002,
    anchorErrorReason: null,
    anchorRetries: 0,
    anchoredAt: new Date('2026-01-01T00:05:00.000Z'),
};

const MOCK_RECORD_2 = {
    ...MOCK_RECORD,
    recordId: '01936d8a-1234-7000-8000-000000000002',
    contentHash: 'sha256:' + 'cc'.repeat(32),
    state: 'pending_anchor',
    contentType: 'image/png',
    tags: ['art'],
    anchorTxHash: null,
    anchorBlock: null,
    anchorChainId: null,
    anchoredAt: null,
};

// --- Mock de drizzle DB ---
// Para el listado necesitamos mockear dos queries: count + select
let mockCountResult: any[] = [{ count: 0 }];
let mockSelectResult: any[] = [];

const mockOffset = vi.fn(() => mockSelectResult);
const mockLimitList = vi.fn(() => ({ offset: mockOffset }));
const mockOrderBy = vi.fn(() => ({ limit: mockLimitList }));

// Para GET /:id y otros endpoints existentes
const mockLimitSingle = vi.fn(() => mockSelectResult);
const mockWhereSingle = vi.fn(() => ({ limit: mockLimitSingle }));

// El mockWhere necesita decidir si devolver la cadena de list o single
const mockWhere = vi.fn((..._args: any[]) => {
    // If called from count, return countResult
    // If called from select with orderBy, return the orderBy chain
    // We detect the context by what was selected
    if (mockSelectingCount) {
        return mockCountResult;
    }
    // Cadena de list: where -> orderBy -> limit -> offset
    return { orderBy: mockOrderBy, limit: mockLimitSingle };
});

let mockSelectingCount = false;
const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn((fields?: any) => {
    // Detectar si es select con count o select sin args
    if (fields && fields.count !== undefined) {
        mockSelectingCount = true;
    } else {
        mockSelectingCount = false;
    }
    return { from: mockFrom };
});

vi.mock('../src/db/index.js', () => ({
    db: {
        select: (...args: any[]) => mockSelect(...args),
    },
}));

vi.mock('../src/db/schema.js', () => ({
    records: {
        recordId: 'record_id',
        contentHash: 'content_hash',
        contentType: 'content_type',
        state: 'state',
        agentWallet: 'agent_wallet',
        createdAt: 'created_at',
        tags: 'tags',
    },
}));

// Mock env
vi.mock('../src/config/env.js', () => ({
    env: {
        L2_CHAIN_ID: '80002',
        FEE_RECEIVER_ADDRESS: '0x1234567890123456789012345678901234567890',
        API_BASE_URL: 'https://api.resexmachina.com',
        PORT: 3000,
        REDIS_URL: 'redis://localhost:6379',
    },
}));

// Mock Redis y servicios que no necesitamos para estos tests
vi.mock('../src/config/redis.js', () => ({
    redisConnectionConfig: {},
    createHealthRedisClient: () => ({}),
    createRateLimitRedisClient: () => ({}),
}));

vi.mock('../src/services/queue.js', () => ({
    enqueueAnchorJob: vi.fn(),
}));

vi.mock('../src/services/signature.js', () => ({
    verifyPoGSignature: vi.fn(),
}));

vi.mock('../src/services/fee.js', () => ({
    verifyFee: vi.fn(),
}));

vi.mock('../src/services/receipt.js', () => ({
    computeReceiptHash: vi.fn(),
}));

// --- App Fastify para tests ---
let app: FastifyInstance;

beforeAll(async () => {
    app = Fastify();
    app.setErrorHandler(apiErrorHandler);
    await app.register(recordRoutes, { prefix: '/v1/records' });
    await app.ready();
});

afterAll(async () => {
    await app.close();
});

beforeEach(() => {
    vi.clearAllMocks();
    mockCountResult = [{ count: 0 }];
    mockSelectResult = [];
});

// =============================================
// GET /v1/records — Listado (Issue #21)
// =============================================

describe('GET /v1/records (Issue #21)', () => {

    it('devuelve 400 si falta agent_wallet', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/records',
        });

        expect(res.statusCode).toBe(400);
        expect(res.json().error.code).toBe('missing_agent_wallet');
    });

    it('returns 400 if agent_wallet is not a valid address', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/v1/records?agent_wallet=not-an-address',
        });

        expect(res.statusCode).toBe(400);
        expect(res.json().error.code).toBe('missing_agent_wallet');
    });

    it('returns 400 if state is not a valid value', async () => {
        const wallet = '0xDd688C11a20e1aDa37CC4A6e4492D5A22bE23A47';
        const res = await app.inject({
            method: 'GET',
            url: `/v1/records?agent_wallet=${wallet}&state=invalid_state`,
        });

        expect(res.statusCode).toBe(400);
        expect(res.json().error.code).toBe('invalid_query_param');
    });

    it('returns empty list if wallet has no records', async () => {
        mockCountResult = [{ count: 0 }];
        mockSelectResult = [];

        const wallet = '0xDd688C11a20e1aDa37CC4A6e4492D5A22bE23A47';
        const res = await app.inject({
            method: 'GET',
            url: `/v1/records?agent_wallet=${wallet}`,
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.records).toEqual([]);
        expect(body.pagination.total).toBe(0);
        expect(body.pagination.has_more).toBe(false);
    });

    it('returns formatted records with pagination', async () => {
        mockCountResult = [{ count: 2 }];
        mockSelectResult = [MOCK_RECORD, MOCK_RECORD_2];

        const wallet = '0xDd688C11a20e1aDa37CC4A6e4492D5A22bE23A47';
        const res = await app.inject({
            method: 'GET',
            url: `/v1/records?agent_wallet=${wallet}`,
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.records).toHaveLength(2);
        expect(body.records[0].record_id).toBe(MOCK_RECORD.recordId);
        expect(body.records[0].state).toBe('anchored');
        expect(body.records[0].fee).toBeDefined();
        expect(body.records[0].anchor).toBeDefined();
        expect(body.records[0].links).toBeDefined();
        expect(body.pagination.total).toBe(2);
        expect(body.pagination.limit).toBe(20);
        expect(body.pagination.offset).toBe(0);
        expect(body.pagination.has_more).toBe(false);
    });

    it('respeta limit y offset personalizados', async () => {
        mockCountResult = [{ count: 50 }];
        mockSelectResult = [MOCK_RECORD];

        const wallet = '0xDd688C11a20e1aDa37CC4A6e4492D5A22bE23A47';
        const res = await app.inject({
            method: 'GET',
            url: `/v1/records?agent_wallet=${wallet}&limit=10&offset=20`,
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.pagination.limit).toBe(10);
        expect(body.pagination.offset).toBe(20);
        expect(body.pagination.has_more).toBe(true);
    });

    it('devuelve 400 si limit es mayor que 100', async () => {
        const wallet = '0xDd688C11a20e1aDa37CC4A6e4492D5A22bE23A47';
        const res = await app.inject({
            method: 'GET',
            url: `/v1/records?agent_wallet=${wallet}&limit=200`,
        });

        expect(res.statusCode).toBe(400);
        expect(res.json().error.code).toBe('invalid_query_param');
    });

    it('accepts valid state filter', async () => {
        mockCountResult = [{ count: 1 }];
        mockSelectResult = [MOCK_RECORD];

        const wallet = '0xDd688C11a20e1aDa37CC4A6e4492D5A22bE23A47';
        const res = await app.inject({
            method: 'GET',
            url: `/v1/records?agent_wallet=${wallet}&state=anchored`,
        });

        expect(res.statusCode).toBe(200);
        expect(res.json().records).toHaveLength(1);
    });

    it('acepta sort=created_at_asc', async () => {
        mockCountResult = [{ count: 1 }];
        mockSelectResult = [MOCK_RECORD];

        const wallet = '0xDd688C11a20e1aDa37CC4A6e4492D5A22bE23A47';
        const res = await app.inject({
            method: 'GET',
            url: `/v1/records?agent_wallet=${wallet}&sort=created_at_asc`,
        });

        expect(res.statusCode).toBe(200);
    });

    it('returns 400 if sort is not a valid value', async () => {
        const wallet = '0xDd688C11a20e1aDa37CC4A6e4492D5A22bE23A47';
        const res = await app.inject({
            method: 'GET',
            url: `/v1/records?agent_wallet=${wallet}&sort=random`,
        });

        expect(res.statusCode).toBe(400);
        expect(res.json().error.code).toBe('invalid_query_param');
    });

    it('acepta filtros from y to en formato ISO 8601', async () => {
        mockCountResult = [{ count: 0 }];
        mockSelectResult = [];

        const wallet = '0xDd688C11a20e1aDa37CC4A6e4492D5A22bE23A47';
        const res = await app.inject({
            method: 'GET',
            url: `/v1/records?agent_wallet=${wallet}&from=2026-01-01T00:00:00Z&to=2026-02-01T00:00:00Z`,
        });

        expect(res.statusCode).toBe(200);
    });
});
