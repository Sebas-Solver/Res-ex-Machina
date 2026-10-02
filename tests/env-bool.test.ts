// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import { envBool } from '../src/config/envBool.js';

describe('envBool (NV-03)', () => {
    it('"false" is false, unlike z.coerce.boolean()', () => {
        const s = envBool(true);
        expect(s.parse('false')).toBe(false);
        expect(s.parse('0')).toBe(false);
        expect(s.parse('FALSE')).toBe(false);
        expect(s.parse('true')).toBe(true);
        expect(s.parse(undefined)).toBe(true);
        expect(s.parse('')).toBe(true);
        expect(envBool(false).parse(undefined)).toBe(false);
    });
    it('rejects anything else at startup', () => {
        expect(() => envBool(false).parse('flase')).toThrow();
    });
});
