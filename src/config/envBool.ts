// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';

/**
 * Boolean env var parsed explicitly. z.coerce.boolean() turns the string "false" into true
 * (finding NV-03: X402_ENABLED=false enabled x402). Unknown strings are rejected at startup.
 */
export const envBool = (defaultValue: boolean) =>
    z.preprocess((v) => {
        if (v === undefined || v === '') return defaultValue;
        if (typeof v === 'boolean') return v;
        const s = String(v).trim().toLowerCase();
        if (['true', '1', 'yes', 'on'].includes(s)) return true;
        if (['false', '0', 'no', 'off'].includes(s)) return false;
        return v;
    }, z.boolean());
