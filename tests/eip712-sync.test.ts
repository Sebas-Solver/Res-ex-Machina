import { describe, it, expect } from 'vitest';

/**
 * Test crítico: verifica que las constantes EIP-712 del SDK coinciden
 * exactamente con las del servidor (fuente única de verdad).
 *
 * Si este test falla, significa que alguien modificó las constantes en un
 * sitio sin actualizar el otro → las firmas divergirán y los integradores
 * nos odiarán.
 */

// Server constants (fuente de verdad)
import { EIP712_DOMAIN as SERVER_DOMAIN, EIP712_TYPES as SERVER_TYPES } from '../src/constants/eip712.js';

// SDK constants (copia para publicación npm)
import { EIP712_DOMAIN as SDK_DOMAIN, EIP712_TYPES as SDK_TYPES } from '../packages/sdk/src/sign.js';

describe('EIP-712 Constants Sync (Server ↔ SDK)', () => {
    describe('EIP712_DOMAIN', () => {
        it('name debe ser idéntico', () => {
            expect(SDK_DOMAIN.name).toBe(SERVER_DOMAIN.name);
        });

        it('version debe ser idéntica', () => {
            expect(SDK_DOMAIN.version).toBe(SERVER_DOMAIN.version);
        });

        it('chainId debe ser idéntico', () => {
            expect(SDK_DOMAIN.chainId).toBe(SERVER_DOMAIN.chainId);
        });

        it('verifyingContract debe ser idéntico', () => {
            expect(SDK_DOMAIN.verifyingContract).toBe(SERVER_DOMAIN.verifyingContract);
        });

        it('domain completo debe ser deep equal', () => {
            expect(SDK_DOMAIN).toEqual(SERVER_DOMAIN);
        });
    });

    describe('EIP712_TYPES', () => {
        it('PoGBundle debe tener el mismo número de campos', () => {
            expect(SDK_TYPES.PoGBundle).toHaveLength(SERVER_TYPES.PoGBundle.length);
        });

        it('cada campo debe tener nombre y tipo idénticos', () => {
            for (let i = 0; i < SERVER_TYPES.PoGBundle.length; i++) {
                expect(SDK_TYPES.PoGBundle[i].name).toBe(SERVER_TYPES.PoGBundle[i].name);
                expect(SDK_TYPES.PoGBundle[i].type).toBe(SERVER_TYPES.PoGBundle[i].type);
            }
        });

        it('types completo debe ser deep equal', () => {
            expect(SDK_TYPES).toEqual(SERVER_TYPES);
        });
    });
});
