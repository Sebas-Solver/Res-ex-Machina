import { describe, it, expect } from 'vitest';
import {
    ApiError,
    invalidPayload,
    invalidSignature,
    feeNotVerified,
    duplicateContentHash,
    recordNotFound,
    invalidRecordId,
} from '../src/utils/errors.js';

describe('ApiError', () => {
    it('tiene los campos correctos', () => {
        const err = new ApiError(400, 'test_code', 'test message', { foo: 'bar' });
        expect(err.statusCode).toBe(400);
        expect(err.code).toBe('test_code');
        expect(err.message).toBe('test message');
        expect(err.details).toEqual({ foo: 'bar' });
        expect(err.name).toBe('ApiError');
    });

    it('toJSON devuelve formato estándar', () => {
        const err = new ApiError(400, 'test', 'msg');
        expect(err.toJSON()).toEqual({
            error: {
                code: 'test',
                message: 'msg',
            },
        });
    });

    it('toJSON incluye details si están presentes', () => {
        const err = new ApiError(400, 'test', 'msg', { key: 'value' });
        expect(err.toJSON()).toEqual({
            error: {
                code: 'test',
                message: 'msg',
                details: { key: 'value' },
            },
        });
    });
});

describe('Error factories', () => {
    it('invalidPayload → 400', () => {
        const err = invalidPayload();
        expect(err.statusCode).toBe(400);
        expect(err.code).toBe('invalid_payload');
    });

    it('invalidSignature → 401', () => {
        const err = invalidSignature();
        expect(err.statusCode).toBe(401);
        expect(err.code).toBe('invalid_signature');
    });

    it('feeNotVerified → 402', () => {
        const err = feeNotVerified('tx not found');
        expect(err.statusCode).toBe(402);
        expect(err.code).toBe('fee_not_verified');
        expect(err.details?.reason).toBe('tx not found');
    });

    it('duplicateContentHash → 409', () => {
        const err = duplicateContentHash();
        expect(err.statusCode).toBe(409);
        expect(err.code).toBe('duplicate_content_hash');
    });

    it('recordNotFound → 404', () => {
        const err = recordNotFound();
        expect(err.statusCode).toBe(404);
        expect(err.code).toBe('record_not_found');
    });

    it('invalidRecordId → 400', () => {
        const err = invalidRecordId();
        expect(err.statusCode).toBe(400);
        expect(err.code).toBe('invalid_record_id');
    });
});
