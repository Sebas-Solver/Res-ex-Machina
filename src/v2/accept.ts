// SPDX-License-Identifier: Apache-2.0
/**
 * Accept an rxm-pog-v2 declaration: every check runs BEFORE anything is stored or anchored.
 * No fee is charged (plan decision D-4); RxM pays the gas, bounded by per-agent and global quotas.
 */
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Address, Hex } from 'viem';
import {
    pogDomain, validateDeclaration, isCanonicalSignature, declarationDigest, recoverDeclarationSigner,
    metadataHash, agentIdForKey, AgentIdScheme, type PoGDeclaration,
} from '@res-ex-machina/pog';
import { ApiError } from '../utils/errors.js';
import { insertDeclaration, getByDigest, countSince, type Db } from './store.js';
import type { DbDeclaration } from '../db/schema.js';

export interface V2Config {
    enabled: boolean;
    chainId: number;
    contract?: Address;
    agentDailyQuota: number;
    globalDailyQuota: number;
}

export interface AcceptDeps {
    db: Db;
    enqueue: (id: string) => Promise<void>;
    now?: () => Date;
}

const hex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const jsonValue: z.ZodType<unknown> = z.lazy(() =>
    z.union([z.null(), z.boolean(), z.number(), z.string(), z.array(jsonValue), z.record(z.string(), jsonValue)]));

export const submitSchema = z.object({
    declaration: z.object({
        agent: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
        contentHash: hex32,
        inputHash: hex32,
        modelId: z.string(),
        runtimeId: z.string(),
        processType: z.number().int(),
        humanIntervention: z.number().int(),
        pipelineSteps: z.number().int(),
        declaredAt: z.union([z.string().regex(/^\d{1,20}$/), z.number().int().nonnegative()]),
        nonce: hex32,
        metadataHash: hex32,
    }).strict(),
    signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
    metadata: z.record(z.string(), jsonValue).optional(),
}).strict();

const MAX_FUTURE_SKEW_S = 300n;

export function toDeclaration(d: z.infer<typeof submitSchema>['declaration']): PoGDeclaration {
    return {
        ...d,
        agent: d.agent as Address,
        contentHash: d.contentHash.toLowerCase() as Hex,
        inputHash: d.inputHash.toLowerCase() as Hex,
        nonce: d.nonce.toLowerCase() as Hex,
        metadataHash: d.metadataHash.toLowerCase() as Hex,
        declaredAt: BigInt(d.declaredAt),
    };
}

export function domainFor(cfg: V2Config) {
    if (!cfg.contract) throw new ApiError(503, 'v2_not_configured', 'No anchoring contract configured');
    return pogDomain(cfg.chainId, cfg.contract);
}

export async function acceptDeclaration(
    cfg: V2Config, deps: AcceptDeps, body: unknown,
): Promise<{ status: 200 | 202; row: DbDeclaration }> {
    if (!cfg.enabled) throw new ApiError(503, 'v2_disabled', 'Declarations are not being accepted right now');
    const domain = domainFor(cfg);

    const parsed = submitSchema.safeParse(body);
    if (!parsed.success) throw new ApiError(400, 'invalid_payload', 'Body does not match the rxm-pog-v2 submission schema', { issues: parsed.error.issues.slice(0, 10) });
    const decl = toDeclaration(parsed.data.declaration);
    const signature = parsed.data.signature.toLowerCase() as Hex;

    const problems = validateDeclaration(decl);
    if (problems.length) throw new ApiError(400, 'invalid_declaration', 'Declaration fields out of range', { problems });
    if (!isCanonicalSignature(signature)) throw new ApiError(422, 'invalid_signature', 'Signature must be 65 bytes, v in {27,28}, low-s');

    const digest = declarationDigest(domain, decl).toLowerCase();
    const signer = await recoverDeclarationSigner(digest as Hex, signature);
    if (signer.toLowerCase() !== decl.agent.toLowerCase()) {
        throw new ApiError(422, 'signature_mismatch', 'Signature was not made by declaration.agent for this chain and contract');
    }

    const metadata = parsed.data.metadata;
    if (metadata !== undefined && metadataHash(metadata as Parameters<typeof metadataHash>[0]).toLowerCase() !== decl.metadataHash) {
        throw new ApiError(422, 'metadata_mismatch', 'SHA-256 of the RFC 8785 canonical metadata does not equal metadataHash');
    }

    const now = deps.now?.() ?? new Date();
    if (decl.declaredAt > BigInt(Math.floor(now.getTime() / 1000)) + MAX_FUTURE_SKEW_S) {
        throw new ApiError(422, 'declared_in_future', 'declaredAt is more than 5 minutes in the future');
    }

    const existing = await getByDigest(deps.db, digest);
    if (existing) return { status: 200, row: existing };

    const agent = decl.agent.toLowerCase();
    const since = new Date(now.getTime() - 24 * 3600 * 1000);
    if (await countSince(deps.db, since, agent) >= cfg.agentDailyQuota) {
        throw new ApiError(429, 'agent_quota_exceeded', `This agent reached ${cfg.agentDailyQuota} declarations in 24 h`);
    }
    if (await countSince(deps.db, since) >= cfg.globalDailyQuota) {
        throw new ApiError(429, 'global_quota_exceeded', 'The service reached its daily anchoring budget; retry later');
    }

    const outcome = await insertDeclaration(deps.db, {
        id: randomUUID(), digest, agent, nonce: decl.nonce, contentHash: decl.contentHash,
        declaration: { ...parsed.data.declaration, agent, declaredAt: decl.declaredAt.toString() },
        signature, metadata: metadata ?? null, chainId: domain.chainId, contract: domain.verifyingContract.toLowerCase(),
        agentIdScheme: AgentIdScheme.uriHash, agentId: agentIdForKey(domain.chainId, decl.agent as Address).toLowerCase(),
    });
    if (outcome.kind === 'nonce_conflict') {
        throw new ApiError(409, 'nonce_reused', 'This agent already used this nonce for a different declaration');
    }
    if (outcome.kind === 'created') await deps.enqueue(outcome.row.id);
    return { status: outcome.kind === 'created' ? 202 : 200, row: outcome.row };
}
