import { describe, it, expect } from 'vitest';

/**
 * Critical test: verifies that the SDK EIP-712 constants match
 * exactly with the server ones (single source of truth).
 *
 * If this test fails, it means someone modified the constants in one
 * place without updating the other → signatures will diverge and integrators
 * will hate us.
 */

// Server constants (fuente de verdad)
import { EIP712_DOMAIN as SERVER_DOMAIN, EIP712_TYPES as SERVER_TYPES } from '../src/constants/eip712.js';

// SDK constants (copy for npm publication)
import { EIP712_DOMAIN as SDK_DOMAIN, EIP712_TYPES as SDK_TYPES } from '../packages/sdk/src/sign.js';

describe('EIP-712 Constants Sync (Server ↔ SDK)', () => {
    describe('EIP712_DOMAIN', () => {
        it('name must be identical', () => {
            expect(SDK_DOMAIN.name).toBe(SERVER_DOMAIN.name);
        });

        it('version must be identical', () => {
            expect(SDK_DOMAIN.version).toBe(SERVER_DOMAIN.version);
        });

        it('chainId must be identical', () => {
            expect(SDK_DOMAIN.chainId).toBe(SERVER_DOMAIN.chainId);
        });

        it('verifyingContract must be identical', () => {
            expect(SDK_DOMAIN.verifyingContract).toBe(SERVER_DOMAIN.verifyingContract);
        });

        it('domain completo debe ser deep equal', () => {
            expect(SDK_DOMAIN).toEqual(SERVER_DOMAIN);
        });
    });

    describe('EIP712_TYPES', () => {
        it('PoGBundle must have the same number of fields', () => {
            expect(SDK_TYPES.PoGBundle).toHaveLength(SERVER_TYPES.PoGBundle.length);
        });

        it('each field must have identical name and type', () => {
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
