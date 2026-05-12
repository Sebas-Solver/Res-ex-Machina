import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { db } from '../db/index.js';
import { records, webhooks } from '../db/schema.js';
import { sql, eq, desc, count } from 'drizzle-orm';
import { env } from '../config/env.js';

/**
 * Admin routes — protected by X-Admin-Key header.
 *
 * Provides platform-wide statistics, record listing,
 * agent activity, and extended health checks for the
 * admin dashboard.
 */

// --- Auth middleware ---

/**
 * Timing-safe comparison of admin API key.
 * Prevents side-channel attacks that could brute-force
 * the key by measuring response time differences.
 */
function safeCompareKey(provided: string, expected: string): boolean {
    if (provided.length !== expected.length) return false;
    try {
        return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
    } catch {
        return false;
    }
}

async function requireAdminKey(request: FastifyRequest, reply: FastifyReply) {
    if (!env.ADMIN_API_KEY) {
        return reply.status(503).send({
            error: { code: 'admin_disabled', message: 'ADMIN_API_KEY not configured' },
        });
    }

    const key = request.headers['x-admin-key'];
    if (!key || typeof key !== 'string' || !safeCompareKey(key, env.ADMIN_API_KEY)) {
        return reply.status(401).send({
            error: { code: 'unauthorized', message: 'Invalid or missing X-Admin-Key header' },
        });
    }
}

// --- Routes ---

export default async function adminRoutes(app: FastifyInstance): Promise<void> {
    /**
     * GET /admin/dashboard
     *
     * Serves the admin dashboard HTML page.
     * No auth required — the page itself has no data.
     * Auth is handled by the JS frontend via X-Admin-Key headers on fetch calls.
     */
    app.get('/dashboard', async (_request, reply) => {
        const path = new URL('../public/admin/index.html', import.meta.url);
        const fs = await import('node:fs/promises');
        try {
            const html = await fs.readFile(path, 'utf-8');
            return reply.type('text/html').send(html);
        } catch {
            return reply.status(404).send({ error: 'Dashboard HTML not found' });
        }
    });

    // Auth config applied per-route via preHandler (not global hook,
    // because Fastify hooks apply to all routes in the plugin scope)
    const authOpts = { preHandler: requireAdminKey };

    /**
     * GET /admin/stats
     *
     * Platform-wide statistics: total records, by state,
     * daily counts for the last 30 days, and top agents.
     */
    app.get('/stats', authOpts, async () => {
        // Total records by state
        const stateCountsRaw = await db
            .select({
                state: records.state,
                count: count(),
            })
            .from(records)
            .groupBy(records.state);

        const stateCounts: Record<string, number> = {};
        let total = 0;
        for (const row of stateCountsRaw) {
            stateCounts[row.state] = row.count;
            total += row.count;
        }

        // Daily counts last 30 days
        const dailyCounts = await db.execute<{ day: string; count: number }>(sql`
            SELECT
                DATE(created_at)::text AS day,
                COUNT(*)::int AS count
            FROM records
            WHERE created_at >= NOW() - INTERVAL '30 days'
            GROUP BY DATE(created_at)
            ORDER BY day ASC
        `);

        // Unique agents count
        const agentCountResult = await db.execute<{ count: number }>(sql`
            SELECT COUNT(DISTINCT agent_wallet)::int AS count FROM records
        `);
        const uniqueAgents = (agentCountResult as unknown as { count: number }[])[0]?.count ?? 0;

        // Total webhooks
        const webhookCountResult = await db
            .select({ count: count() })
            .from(webhooks);
        const totalWebhooks = webhookCountResult[0]?.count ?? 0;

        return {
            total_records: total,
            by_state: {
                pending_anchor: stateCounts['pending_anchor'] ?? 0,
                anchored: stateCounts['anchored'] ?? 0,
                anchor_failed: stateCounts['anchor_failed'] ?? 0,
            },
            unique_agents: uniqueAgents,
            total_webhooks: totalWebhooks,
            daily_last_30d: dailyCounts as unknown as { day: string; count: number }[],
        };
    });

    /**
     * GET /admin/records?limit=20&offset=0&state=anchored
     *
     * Paginated list of ALL records (not filtered by wallet).
     */
    app.get('/records', authOpts, async (request) => {
        const query = request.query as {
            limit?: string;
            offset?: string;
            state?: string;
        };

        const limit = Math.min(parseInt(query.limit || '20', 10), 100);
        const offset = parseInt(query.offset || '0', 10);

        const selectFields = {
            recordId: records.recordId,
            contentHash: records.contentHash,
            agentWallet: records.agentWallet,
            state: records.state,
            createdAt: records.createdAt,
            feeAmount: records.feeAmount,
            feeCurrency: records.feeCurrency,
            anchorTxHash: records.anchorTxHash,
            anchorBlock: records.anchorBlock,
        };

        const rows = query.state
            ? await db.select(selectFields).from(records)
                .where(eq(records.state, query.state))
                .orderBy(desc(records.createdAt)).limit(limit).offset(offset)
            : await db.select(selectFields).from(records)
                .orderBy(desc(records.createdAt)).limit(limit).offset(offset);

        // Total count for pagination
        const totalResult = query.state
            ? await db.select({ count: count() }).from(records).where(eq(records.state, query.state))
            : await db.select({ count: count() }).from(records);

        return {
            records: rows.map((r) => ({
                record_id: r.recordId,
                content_hash: r.contentHash,
                agent_wallet: r.agentWallet,
                state: r.state,
                created_at: r.createdAt,
                fee: { amount: r.feeAmount, currency: r.feeCurrency },
                anchor_tx_hash: r.anchorTxHash,
                anchor_block: r.anchorBlock,
            })),
            pagination: {
                total: totalResult[0]?.count ?? 0,
                limit,
                offset,
            },
        };
    });

    /**
     * GET /admin/agents
     *
     * List of unique agent wallets with record counts and last activity.
     */
    app.get('/agents', authOpts, async () => {
        type AgentRow = {
            agent_wallet: string;
            record_count: number;
            last_active: string;
            anchored_count: number;
            pending_count: number;
            failed_count: number;
        };

        const agents = await db.execute<AgentRow>(sql`
            SELECT
                agent_wallet,
                COUNT(*)::int AS record_count,
                MAX(created_at)::text AS last_active,
                COUNT(*) FILTER (WHERE state = 'anchored')::int AS anchored_count,
                COUNT(*) FILTER (WHERE state = 'pending_anchor')::int AS pending_count,
                COUNT(*) FILTER (WHERE state = 'anchor_failed')::int AS failed_count
            FROM records
            GROUP BY agent_wallet
            ORDER BY record_count DESC
        `);

        const agentList = agents as unknown as AgentRow[];

        return {
            agents: agentList,
            total: agentList.length,
        };
    });
}
