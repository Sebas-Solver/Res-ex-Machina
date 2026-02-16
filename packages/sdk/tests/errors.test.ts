import { describe, it, expect } from 'vitest';
import { RxMError, RxMRateLimitError, RxMNetworkError, RxMValidationError, parseApiError } from '../src/errors.js';

describe('SDK Errors', () => {
    describe('RxMError', () => {
        it('should store code, message, statusCode, details', () => {
            const err = new RxMError('test_code', 'Test message', 400, { key: 'val' });
            expect(err.code).toBe('test_code');
            expect(err.message).toBe('Test message');
            expect(err.statusCode).toBe(400);
            expect(err.details).toEqual({ key: 'val' });
            expect(err.name).toBe('RxMError');
        });

        it('should be instanceof Error', () => {
            const err = new RxMError('code', 'msg');
            expect(err).toBeInstanceOf(Error);
        });
    });

    describe('RxMRateLimitError', () => {
        it('should have retryAfterMs', () => {
            const err = new RxMRateLimitError(5000);
            expect(err.retryAfterMs).toBe(5000);
            expect(err.code).toBe('rate_limit_exceeded');
            expect(err.statusCode).toBe(429);
        });
    });

    describe('RxMValidationError', () => {
        it('should have status 400', () => {
            const err = new RxMValidationError('bad input');
            expect(err.statusCode).toBe(400);
            expect(err.code).toBe('validation_error');
        });
    });

    describe('parseApiError', () => {
        it('should parse 429 as RxMRateLimitError', () => {
            const error = parseApiError(429, {
                error: { code: 'rate_limit_exceeded', message: 'Too many', details: { reset: 60000 } },
            });
            expect(error).toBeInstanceOf(RxMRateLimitError);
            expect((error as RxMRateLimitError).retryAfterMs).toBe(60000);
        });

        it('should parse generic API error', () => {
            const error = parseApiError(400, {
                error: { code: 'invalid_payload', message: 'Bad body' },
            });
            expect(error.code).toBe('invalid_payload');
            expect(error.statusCode).toBe(400);
        });

        it('should handle empty body gracefully', () => {
            const error = parseApiError(500, {});
            expect(error.code).toBe('unknown_error');
        });
    });
});
