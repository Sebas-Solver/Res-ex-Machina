import { describe, it, expect, vi } from 'vitest';
import { createWebhookSchema } from '../src/routes/schemas/webhookSchema.js';
import { signPayload } from '../src/services/webhookDispatcher.js';

/**
 * Tests para webhooks (Issue #13).
 *
 * Grupos:
 * 1. Schema validation — createWebhookSchema (Zod)
 * 2. URL validation — SSRF
 * 3. HMAC signature
 * 4. Error factories
 */

// Mock de módulos que requieren Redis/DB
vi.mock('../src/db/index.js', () => ({
    db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));

vi.mock('../src/config/redis.js', () => ({
    redisConnectionConfig: {},
    createHealthRedisClient: () => ({}),
    createRateLimitRedisClient: () => ({}),
}));

vi.mock('../src/services/queue.js', () => ({
    enqueueAnchorJob: vi.fn(),
}));

// =============================================
// createWebhookSchema — Validation
// =============================================

describe('createWebhookSchema (Issue #13)', () => {

    it('acepta URL HTTPS válida', () => {
        const result = createWebhookSchema.safeParse({
            url: 'https://example.com/webhook',
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.events).toEqual(['state_changed']);
        }
    });

    it('rechaza URL HTTP (solo HTTPS permitido)', () => {
        const result = createWebhookSchema.safeParse({
            url: 'http://example.com/webhook',
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toContain('HTTPS');
        }
    });

    it('rechaza URL inválida', () => {
        const result = createWebhookSchema.safeParse({
            url: 'not-a-url',
        });
        expect(result.success).toBe(false);
    });

    it('rechaza URL excesivamente larga (>2048)', () => {
        const result = createWebhookSchema.safeParse({
            url: 'https://example.com/' + 'a'.repeat(2040),
        });
        expect(result.success).toBe(false);
    });

    it('acepta eventos personalizados válidos', () => {
        const result = createWebhookSchema.safeParse({
            url: 'https://example.com/webhook',
            events: ['state_changed'],
        });
        expect(result.success).toBe(true);
    });

    it('rechaza evento inválido', () => {
        const result = createWebhookSchema.safeParse({
            url: 'https://example.com/webhook',
            events: ['invalid_event'],
        });
        expect(result.success).toBe(false);
    });

    it('rechaza si falta url', () => {
        const result = createWebhookSchema.safeParse({});
        expect(result.success).toBe(false);
    });
});

// =============================================
// SSRF URL Validation
// =============================================

describe('URL Validator — SSRF mitigation (Issue #13)', () => {

    it('rechaza URLs HTTP', async () => {
        const { validateWebhookUrl } = await import('../src/utils/urlValidator.js');
        await expect(validateWebhookUrl('http://example.com/hook'))
            .rejects.toThrow('Only HTTPS');
    });

    it('rechaza localhost', async () => {
        const { validateWebhookUrl } = await import('../src/utils/urlValidator.js');
        await expect(validateWebhookUrl('https://localhost/hook'))
            .rejects.toThrow('localhost');
    });

    it('rechaza 127.0.0.1', async () => {
        const { validateWebhookUrl } = await import('../src/utils/urlValidator.js');
        await expect(validateWebhookUrl('https://127.0.0.1/hook'))
            .rejects.toThrow('localhost');
    });

    it('rechaza URLs con protocolo inválido', async () => {
        const { validateWebhookUrl } = await import('../src/utils/urlValidator.js');
        await expect(validateWebhookUrl('ftp://example.com/hook'))
            .rejects.toThrow('HTTPS');
    });
});

// =============================================
// HMAC Signature
// =============================================

describe('HMAC-SHA256 signature (Issue #13)', () => {

    it('genera firma determinista', () => {
        const secret = 'test-secret-key';
        const body = '{"event":"state_changed"}';
        const sig1 = signPayload(secret, body);
        const sig2 = signPayload(secret, body);
        expect(sig1).toBe(sig2);
        expect(sig1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('firma cambia con payload diferente', () => {
        const secret = 'test-secret-key';
        const sig1 = signPayload(secret, '{"a":1}');
        const sig2 = signPayload(secret, '{"a":2}');
        expect(sig1).not.toBe(sig2);
    });

    it('firma cambia con secret diferente', () => {
        const body = '{"event":"state_changed"}';
        const sig1 = signPayload('secret-1', body);
        const sig2 = signPayload('secret-2', body);
        expect(sig1).not.toBe(sig2);
    });
});

// =============================================
// Error factories — Webhooks
// =============================================

describe('Webhook error factories (Issue #13)', () => {

    it('webhookNotFound → 404', async () => {
        const { webhookNotFound } = await import('../src/utils/errors.js');
        const err = webhookNotFound();
        expect(err.statusCode).toBe(404);
        expect(err.code).toBe('webhook_not_found');
    });

    it('webhookLimitReached → 400', async () => {
        const { webhookLimitReached } = await import('../src/utils/errors.js');
        const err = webhookLimitReached();
        expect(err.statusCode).toBe(400);
        expect(err.code).toBe('webhook_limit_reached');
    });

    it('webhookInvalidUrl → 400 con details', async () => {
        const { webhookInvalidUrl } = await import('../src/utils/errors.js');
        const err = webhookInvalidUrl({ reason: 'IP privada' });
        expect(err.statusCode).toBe(400);
        expect(err.code).toBe('webhook_invalid_url');
        expect(err.details).toEqual({ reason: 'IP privada' });
    });

    it('webhookForbidden → 403', async () => {
        const { webhookForbidden } = await import('../src/utils/errors.js');
        const err = webhookForbidden();
        expect(err.statusCode).toBe(403);
        expect(err.code).toBe('webhook_forbidden');
    });
});
