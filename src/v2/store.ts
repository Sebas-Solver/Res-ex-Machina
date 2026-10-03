// SPDX-License-Identifier: Apache-2.0
/**
 * Persistence for rxm-pog-v2 declarations. Every function takes the Drizzle instance as a
 * parameter so it can be tested against an in-process Postgres (PGlite).
 */
import { and, eq, gte, lt, or, sql, count } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { declarations, type DbDeclaration, type NewDeclaration } from '../db/schema.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = PgDatabase<PgQueryResultHKT, any>;

export type InsertOutcome =
    | { kind: 'created'; row: DbDeclaration }
    | { kind: 'duplicate'; row: DbDeclaration }
    | { kind: 'nonce_conflict' };

/** Insert, or report the existing row. Same digest = idempotent re-submission. */
export async function insertDeclaration(db: Db, row: NewDeclaration): Promise<InsertOutcome> {
    const inserted = await db.insert(declarations).values(row).onConflictDoNothing().returning();
    if (inserted.length === 1) return { kind: 'created', row: inserted[0] };
    const [same] = await db.select().from(declarations).where(eq(declarations.digest, row.digest)).limit(1);
    if (same) return { kind: 'duplicate', row: same };
    return { kind: 'nonce_conflict' };
}

export async function getByDigest(db: Db, digest: string): Promise<DbDeclaration | undefined> {
    const [row] = await db.select().from(declarations).where(eq(declarations.digest, digest.toLowerCase())).limit(1);
    return row;
}

export async function getById(db: Db, id: string): Promise<DbDeclaration | undefined> {
    const [row] = await db.select().from(declarations).where(eq(declarations.id, id)).limit(1);
    return row;
}

export async function countSince(db: Db, since: Date, agent?: string): Promise<number> {
    const cond = agent
        ? and(eq(declarations.agent, agent), gte(declarations.createdAt, since))
        : gte(declarations.createdAt, since);
    const [r] = await db.select({ n: count() }).from(declarations).where(cond);
    return Number(r?.n ?? 0);
}

/**
 * Atomically take a declaration for anchoring, with a lease. A crashed worker's lease expires,
 * so the row is never stuck (fixes A-02 for v2).
 */
export async function claimForAnchoring(db: Db, id: string, leaseSeconds: number): Promise<DbDeclaration | undefined> {
    const [row] = await db.update(declarations)
        .set({
            state: 'anchoring',
            leaseUntil: sql`now() + make_interval(secs => ${leaseSeconds})`,
            attempts: sql`${declarations.attempts} + 1`,
        })
        .where(and(
            eq(declarations.id, id),
            or(
                eq(declarations.state, 'pending'),
                and(eq(declarations.state, 'anchoring'), lt(declarations.leaseUntil, sql`now()`)),
            ),
        ))
        .returning();
    return row;
}

/** Record the transaction hash right after sending, before waiting for it. */
export async function recordSentTx(db: Db, id: string, txHash: string): Promise<void> {
    await db.update(declarations).set({ anchorTxHash: txHash.toLowerCase() })
        .where(and(eq(declarations.id, id), eq(declarations.state, 'anchoring')));
}

export async function markAnchored(
    db: Db, id: string,
    a: { txHash: string; logIndex: number; block: bigint; blockTime: Date },
): Promise<boolean> {
    const rows = await db.update(declarations)
        .set({
            state: 'anchored', anchorTxHash: a.txHash.toLowerCase(), anchorLogIndex: a.logIndex,
            anchorBlock: a.block, anchorBlockTime: a.blockTime, anchoredAt: sql`now()`,
            leaseUntil: null, lastError: null,
        })
        .where(and(eq(declarations.id, id), eq(declarations.state, 'anchoring')))
        .returning({ id: declarations.id });
    return rows.length === 1;
}

/** Back to pending (retryable) or failed after maxAttempts. Only from `anchoring`. */
export async function markAttemptFailed(db: Db, id: string, error: string, maxAttempts: number): Promise<'pending' | 'failed' | 'unchanged'> {
    const [row] = await db.update(declarations)
        .set({
            state: sql`CASE WHEN ${declarations.attempts} >= ${maxAttempts} THEN 'failed' ELSE 'pending' END`,
            lastError: error.slice(0, 500), leaseUntil: null,
        })
        .where(and(eq(declarations.id, id), eq(declarations.state, 'anchoring')))
        .returning({ state: declarations.state });
    return (row?.state as 'pending' | 'failed') ?? 'unchanged';
}

/** Rows a reconciler should re-enqueue: pending, or anchoring with an expired lease. */
export async function listToReconcile(db: Db, limit = 100): Promise<string[]> {
    const rows = await db.select({ id: declarations.id }).from(declarations)
        .where(or(
            eq(declarations.state, 'pending'),
            and(eq(declarations.state, 'anchoring'), lt(declarations.leaseUntil, sql`now()`)),
        ))
        .limit(limit);
    return rows.map((r) => r.id);
}

/** Give a claimed row back without counting the attempt (e.g. the relayer is paused for low balance). */
export async function releaseClaim(db: Db, id: string, reason: string): Promise<void> {
    await db.update(declarations)
        .set({ state: 'pending', leaseUntil: null, lastError: reason.slice(0, 500), attempts: sql`greatest(${declarations.attempts} - 1, 0)` })
        .where(and(eq(declarations.id, id), eq(declarations.state, 'anchoring')));
}
