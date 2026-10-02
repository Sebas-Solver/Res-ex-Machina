// SPDX-License-Identifier: Apache-2.0
import { isAddress, isHex } from 'viem';
import type { PoGDeclaration } from './types.js';

const isBytes32 = (v: unknown): boolean => typeof v === 'string' && isHex(v, { strict: true }) && v.length === 66;
const utf8Len = (s: string): number => new TextEncoder().encode(s).length;
const MAX_UINT64 = (1n << 64n) - 1n;

/**
 * Structural checks of spec/rxm-pog-v2.md §3.2. Returns a list of problems; empty means valid.
 * Run it BEFORE accepting payment or anchoring anything.
 */
export function validateDeclaration(d: PoGDeclaration): string[] {
    const errors: string[] = [];
    if (!isAddress(d.agent, { strict: false })) errors.push('agent: not an address');
    for (const k of ['contentHash', 'inputHash', 'nonce', 'metadataHash'] as const) {
        if (!isBytes32(d[k])) errors.push(`${k}: must be 0x-prefixed 32 bytes`);
    }
    if (isBytes32(d.contentHash) && /^0x0+$/.test(d.contentHash)) errors.push('contentHash: must not be zero');
    if (isBytes32(d.nonce) && /^0x0+$/.test(d.nonce)) errors.push('nonce: must not be zero');
    for (const k of ['modelId', 'runtimeId'] as const) {
        const n = typeof d[k] === 'string' ? utf8Len(d[k]) : 0;
        if (n < 1 || n > 128) errors.push(`${k}: 1-128 UTF-8 bytes`);
    }
    if (!Number.isInteger(d.processType) || d.processType < 0 || d.processType > 3) errors.push('processType: 0-3');
    if (!Number.isInteger(d.humanIntervention) || d.humanIntervention < 0 || d.humanIntervention > 5) errors.push('humanIntervention: 0-5');
    if (!Number.isInteger(d.pipelineSteps) || d.pipelineSteps < 1 || d.pipelineSteps > 65535) errors.push('pipelineSteps: 1-65535');
    if (typeof d.declaredAt !== 'bigint' || d.declaredAt < 0n || d.declaredAt > MAX_UINT64) errors.push('declaredAt: uint64 seconds');
    return errors;
}
