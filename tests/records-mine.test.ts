// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import recordRoutes from '../src/routes/records.js';
import { apiErrorHandler } from '../src/utils/errors.js';

/**
 * Tests para GET /v1/records/mine (Issue #26, P0-1 fix).
 *
 * Verifica que el total usa SQL COUNT(*) y no .length,
 * y que la paginación funciona correctamente.
 */

// --- Fixture: record como lo devuelve la DB ---
const MOCK_RECORD = {
    recordId: '01936d8a-1234-7000-8000-000000000001',
    contentHash: 'sha256:' + 'ab'.repeat(32),
    contentType: 'text/plain',
    visibility: 'proof_only',
    pogBundle: {
        schema: 'pog.v1',
        content_hash: 'sha256:' + 'ab'.repeat(32),
        agent_wallet: '0xdd688c11a20e1ada37cc4a6e4492d5a22be23a47',
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
    agentWallet: '0xdd688c11a20e1ada37cc4a6e4492d5a22be23a47',
    state: 'anchored',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    receiptHash: 'sha256:' + 'cd'.repeat(32),
    tags: ['test'],
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
    provenanceMetadata: null,
};

// --- Mock drizzle ---
// The /mine handler does two queries: COUNT(*) + SELECT with pagination.
// We mock them to verify the handler reads the count from the SQL result, not .length.
let mockCountResult: any[] = [{ count: 0 }];
let mockSelectResult: any[] = [];
let mockSelectingCount = false;

const mockOffset = vi.fn(() => mockSelectResult);
const mockLimitList = vi.fn(() => ({ offset: mockOffset }));
const mockOrderBy = vi.fn(() => ({ limit: mockLimitList }));

const mockWhere = vi.fn((..._args: any[]) => {
    if (mockSelectingCount) {
        return mockCountResult;
    }
    return { orderBy: mockOrderBy, limit: vi.fn(() => mockSelectResult) };
});

const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn((fields?: any) => {
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

vi.mock('../src/config/env.js', () => ({
    env: {
        L2_CHAIN_ID: '80002',
        FEE_RECEIVER_ADDRESS: '0x1234567890123456789012345678901234567890',
        API_BASE_URL: 'https://api.resexmachina.com',
        PORT: 3000,
        REDIS_URL: 'redis://localhost:6379',
    },
}));

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

// Mock walletAuth — simulates authenticated request
vi.mock('../src/middleware/walletAuth.js', () => ({
    walletAuth: vi.fn(async (request: any) => {
        // Simulate authenticated wallet (lowercase, as the real middleware does)
        request.authenticatedWallet = '0xdd688c11a20e1ada37cc4a6e4492d5a22be23a47';
    }),
}));

// --- App Fastify ---
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
// GET /v1/records/mine (Issue #26, P0-1 fix)
// =============================================

describe('GET /v1/records/mine', () => {

    it('returns wallet records with SQL-based total (not .length)', async () => {
        // Simulates a wallet with 150 records, but only returns 2 in the page.
        // If .length were used, total would be 2 instead of 150.
        mockCountResult = [{ count: 150 }];
        mockSelectResult = [MOCK_RECORD, { ...MOCK_RECORD, recordId: '01936d8a-1234-7000-8000-000000000002' }];

        const res = await app.inject({
            method: 'GET',
            url: '/v1/records/mine',
            headers: {
                'x-wallet-address': '0xdd688c11a20e1ada37cc4a6e4492d5a22be23a47',
                'x-wallet-signature': '0x' + 'ab'.repeat(65),
                'x-wallet-timestamp': new Date().toISOString(),
            },
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();

        // Critical assertion: total comes from SQL COUNT, not from result array length
        expect(body.total).toBe(150);
        expect(body.records).toHaveLength(2);
        expect(body.pagination.has_more).toBe(true);
    });

    it('returns empty list when wallet has no records', async () => {
        mockCountResult = [{ count: 0 }];
        mockSelectResult = [];

        const res = await app.inject({
            method: 'GET',
            url: '/v1/records/mine',
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.total).toBe(0);
        expect(body.records).toEqual([]);
        expect(body.pagination.has_more).toBe(false);
    });

    it('respects custom limit and offset', async () => {
        mockCountResult = [{ count: 100 }];
        mockSelectResult = [MOCK_RECORD];

        const res = await app.inject({
            method: 'GET',
            url: '/v1/records/mine?limit=5&offset=10',
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.pagination.limit).toBe(5);
        expect(body.pagination.offset).toBe(10);
        expect(body.pagination.has_more).toBe(true); // 10 + 5 < 100
    });

    it('clamps limit to max 100', async () => {
        mockCountResult = [{ count: 1 }];
        mockSelectResult = [MOCK_RECORD];

        const res = await app.inject({
            method: 'GET',
            url: '/v1/records/mine?limit=500',
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.pagination.limit).toBe(100);
    });

    it('handles has_more=false when at last page', async () => {
        mockCountResult = [{ count: 3 }];
        mockSelectResult = [MOCK_RECORD];

        const res = await app.inject({
            method: 'GET',
            url: '/v1/records/mine?limit=20&offset=0',
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.pagination.has_more).toBe(false); // 0 + 20 >= 3
    });
});
