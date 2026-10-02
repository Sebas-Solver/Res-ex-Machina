// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import type { Hex } from 'viem';
import { ZERO_HASH } from './types.js';

/** SHA-256 of the exact bytes (strings are UTF-8 encoded). */
export function sha256(data: Uint8Array | string): Hex {
    return `0x${createHash('sha256').update(data).digest('hex')}`;
}

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

/**
 * RFC 8785 (JCS) canonical JSON. Keys are sorted by UTF-16 code units and strings and numbers
 * are serialised as ECMAScript JSON.stringify does, which is what RFC 8785 specifies.
 */
export function canonicalJson(value: Json): string {
    if (value === null || typeof value === 'boolean') return JSON.stringify(value);
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new Error('JCS: non-finite numbers are not allowed');
        return JSON.stringify(value);
    }
    if (typeof value === 'string') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k] as Json)}`).join(',')}}`;
}

/** metadataHash = SHA-256 of the canonical JSON, or zero when there is no metadata (§3.2). */
export function metadataHash(metadata: Record<string, Json> | null | undefined): Hex {
    if (!metadata || Object.keys(metadata).length === 0) return ZERO_HASH;
    return sha256(canonicalJson(metadata));
}
