import { describe, it, expect } from 'vitest';
import { computeReceiptHash } from '../src/services/receipt.js';

describe('computeReceiptHash', () => {
    it('devuelve formato sha256:{64hex}', () => {
        const hash = computeReceiptHash(
            '01936d8a-1234-7000-8000-000000000001',
            'sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
            '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
            'nonce-test-1234567890',
            new Date('2026-01-01T00:00:00.000Z'),
        );

        expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    it('es determinista — mismos inputs = mismo hash', () => {
        const args = [
            '01936d8a-1234-7000-8000-000000000001',
            'sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
            '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
            'nonce-test-1234567890',
            new Date('2026-01-01T00:00:00.000Z'),
        ] as const;

        const hash1 = computeReceiptHash(...args);
        const hash2 = computeReceiptHash(...args);
        expect(hash1).toBe(hash2);
    });

    it('cambia si cambia cualquier input', () => {
        const base = computeReceiptHash(
            '01936d8a-1234-7000-8000-000000000001',
            'sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
            '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
            'nonce-test-1234567890',
            new Date('2026-01-01T00:00:00.000Z'),
        );

        // Cambiar solo el nonce
        const different = computeReceiptHash(
            '01936d8a-1234-7000-8000-000000000001',
            'sha256:abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
            '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
            'nonce-DIFERENTE-9999',
            new Date('2026-01-01T00:00:00.000Z'),
        );

        expect(base).not.toBe(different);
    });

    it('normaliza la wallet a lowercase', () => {
        const upper = computeReceiptHash(
            'id-1', 'sha256:aa' + '00'.repeat(31), '0xABCDEF1234567890ABCDEF1234567890ABCDEF12', 'n1', new Date('2026-01-01T00:00:00Z'),
        );
        const lower = computeReceiptHash(
            'id-1', 'sha256:aa' + '00'.repeat(31), '0xabcdef1234567890abcdef1234567890abcdef12', 'n1', new Date('2026-01-01T00:00:00Z'),
        );
        expect(upper).toBe(lower);
    });
});
