// SPDX-License-Identifier: Apache-2.0
/**
 * Minimal client for the rxm-pog-v2 HTTP API: build, sign, submit, wait for the anchor.
 * The receipt it returns is meant to be verified independently (verifyReceipt / rxm-verify),
 * never trusted because the API said so.
 */
import { bytesToHex, type Address, type Hex, type LocalAccount } from 'viem';
import type { PoGDeclaration } from './types.js';
import { ProcessType, ZERO_HASH } from './types.js';
import { pogDomain, signDeclaration } from './eip712.js';
import { sha256, metadataHash } from './content.js';
import { validateDeclaration } from './validate.js';

type JsonMeta = Parameters<typeof metadataHash>[0];

export interface DeclareInput {
    /** The generated content, exactly as it will be delivered. */
    content: Uint8Array | string;
    /** The prompt or input, if you want to commit to it. */
    input?: Uint8Array | string;
    modelId: string;
    runtimeId: string;
    processType?: keyof typeof ProcessType;
    humanIntervention?: number;
    pipelineSteps?: number;
    /** Stored by the API; its RFC 8785 hash is signed. */
    metadata?: JsonMeta;
}

export class RxMApiError extends Error {
    constructor(public readonly status: number, public readonly code: string, message: string) {
        super(message);
        this.name = 'RxMApiError';
    }
}

/** Build an unsigned declaration with a random nonce and the current time. */
export function buildDeclaration(agent: Address, input: DeclareInput, now: Date = new Date()): PoGDeclaration {
    const nonce = new Uint8Array(32);
    globalThis.crypto.getRandomValues(nonce);
    const d: PoGDeclaration = {
        agent,
        contentHash: sha256(input.content),
        inputHash: input.input === undefined ? ZERO_HASH : sha256(input.input),
        modelId: input.modelId,
        runtimeId: input.runtimeId,
        processType: ProcessType[input.processType ?? 'direct'],
        humanIntervention: input.humanIntervention ?? 0,
        pipelineSteps: input.pipelineSteps ?? 1,
        declaredAt: BigInt(Math.floor(now.getTime() / 1000)),
        nonce: bytesToHex(nonce),
        metadataHash: metadataHash(input.metadata ?? null),
    };
    const problems = validateDeclaration(d);
    if (problems.length) throw new Error(`invalid declaration: ${problems.join('; ')}`);
    return d;
}

export interface ClientOptions {
    apiUrl: string;
    /** Chain and RxMAnchor deployment the API anchors to (published with each deployment). */
    chainId: number;
    contract: Address;
    fetch?: typeof fetch;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Receipt = Record<string, any> & { digest: Hex; state: 'pending' | 'anchoring' | 'anchored' | 'failed' };

export class RxMClient {
    private readonly base: string;
    private readonly f: typeof fetch;
    constructor(private readonly opts: ClientOptions) {
        // Strip trailing slashes without a regex (avoids polynomial backtracking on long '/' runs).
        let end = opts.apiUrl.length;
        while (end > 0 && opts.apiUrl[end - 1] === '/') end--;
        this.base = opts.apiUrl.slice(0, end);
        this.f = opts.fetch ?? globalThis.fetch.bind(globalThis);
    }

    get domain() { return pogDomain(this.opts.chainId, this.opts.contract); }

    /** Build, sign with `account` and submit. Returns the API receipt (state pending or already known). */
    async declare(account: LocalAccount, input: DeclareInput): Promise<Receipt> {
        const declaration = buildDeclaration(account.address, input);
        const signature = await signDeclaration(account, this.domain, declaration);
        return this.request('POST', '/v2/declarations', {
            declaration: { ...declaration, declaredAt: declaration.declaredAt.toString() },
            signature,
            ...(input.metadata ? { metadata: input.metadata } : {}),
        });
    }

    get(digest: Hex): Promise<Receipt> {
        return this.request('GET', `/v2/declarations/${digest}`);
    }

    /** Poll until anchored. Throws on `failed` or timeout. */
    async waitForAnchor(digest: Hex, opts: { timeoutMs?: number; intervalMs?: number } = {}): Promise<Receipt> {
        const deadline = Date.now() + (opts.timeoutMs ?? 120_000);
        for (;;) {
            const r = await this.get(digest);
            if (r.state === 'anchored') return r;
            if (r.state === 'failed') throw new RxMApiError(200, 'anchor_failed', `anchoring failed for ${digest}`);
            if (Date.now() >= deadline) throw new RxMApiError(0, 'timeout', `not anchored after ${opts.timeoutMs ?? 120_000} ms`);
            await new Promise((res) => setTimeout(res, opts.intervalMs ?? 3_000));
        }
    }

    private async request(method: 'GET' | 'POST', path: string, body?: unknown): Promise<Receipt> {
        const res = await this.f(this.base + path, {
            method,
            headers: body ? { 'content-type': 'application/json' } : undefined,
            body: body ? JSON.stringify(body) : undefined,
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
            const err = (json as { error?: { code?: string; message?: string } }).error;
            throw new RxMApiError(res.status, err?.code ?? 'http_error', err?.message ?? `HTTP ${res.status}`);
        }
        return json as Receipt;
    }
}
