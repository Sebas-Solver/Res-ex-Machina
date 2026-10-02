#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
/**
 * rxm-verify — verify an rxm-pog-v2 receipt against the chain, without any Res ex Machina service.
 *
 *   rxm-verify <receipt.json | https://…> [--content <file>] [--rpc <url>] [--json]
 *
 * Exit code: 0 valid, 1 not valid, 2 usage or I/O error.
 */
import { readFileSync } from 'node:fs';
import { verifyReceipt } from './receipt.js';
import type { VerifyResult } from './verify.js';

export interface CliArgs { source: string; content?: string; rpc?: string; json: boolean }

export function parseArgs(argv: string[]): CliArgs {
    const out: Partial<CliArgs> = { json: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--content') out.content = argv[++i];
        else if (a === '--rpc') out.rpc = argv[++i];
        else if (a === '--json') out.json = true;
        else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
        else if (!out.source) out.source = a;
        else throw new Error(`unexpected argument ${a}`);
    }
    if (!out.source) throw new Error('usage: rxm-verify <receipt.json | url> [--content <file>] [--rpc <url>] [--json]');
    if (('content' in out && !out.content) || ('rpc' in out && !out.rpc)) throw new Error('--content and --rpc need a value');
    return out as CliArgs;
}

export function formatResult(r: VerifyResult): string {
    const lines = r.checks.map((c) => `  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name.padEnd(20)} ${c.detail}`);
    for (const w of r.warnings) lines.push(`  WARN  ${w}`);
    lines.push('', r.valid ? 'VALID' : 'NOT VALID');
    if (r.statement) lines.push('', r.statement);
    return lines.join('\n');
}

async function main(): Promise<number> {
    let args: CliArgs;
    try { args = parseArgs(process.argv.slice(2)); } catch (e) { console.error((e as Error).message); return 2; }
    let json: unknown;
    try {
        json = /^https?:\/\//.test(args.source)
            ? await (await fetch(args.source)).json()
            : JSON.parse(readFileSync(args.source, 'utf8'));
    } catch (e) { console.error(`cannot read receipt: ${(e as Error).message}`); return 2; }
    const content = args.content ? readFileSync(args.content) : undefined;
    try {
        const r = await verifyReceipt(json, { rpcUrl: args.rpc, content: content ? new Uint8Array(content) : undefined });
        console.log(args.json ? JSON.stringify(r, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2) : formatResult(r));
        return r.valid ? 0 : 1;
    } catch (e) { console.error((e as Error).message); return 2; }
}

// Run only when executed directly, not when imported by tests.
if (process.argv[1] && /rxm-verify|cli\.js$/.test(process.argv[1])) {
    main().then((code) => process.exit(code));
}
