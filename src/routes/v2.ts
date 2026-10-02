// SPDX-License-Identifier: Apache-2.0
import type { FastifyInstance } from 'fastify';
import { acceptDeclaration, type V2Config, type AcceptDeps } from '../v2/accept.js';
import { getByDigest } from '../v2/store.js';
import { toReceipt } from '../v2/receipt.js';
import { ApiError } from '../utils/errors.js';

export interface V2RouteOptions {
    config: V2Config;
    deps: AcceptDeps;
}

/**
 * rxm-pog-v2 endpoints. There is deliberately no public listing by agent (INV-021).
 */
export default async function v2Routes(app: FastifyInstance, opts: V2RouteOptions) {
    app.post('/declarations', async (request, reply) => {
        const { status, row } = await acceptDeclaration(opts.config, opts.deps, request.body);
        return reply.status(status).send(toReceipt(row));
    });

    app.get<{ Params: { digest: string } }>('/declarations/:digest', async (request) => {
        const { digest } = request.params;
        if (!/^0x[0-9a-fA-F]{64}$/.test(digest)) throw new ApiError(400, 'invalid_digest', 'digest must be 0x + 64 hex');
        const row = await getByDigest(opts.deps.db, digest);
        if (!row) throw new ApiError(404, 'declaration_not_found', 'No declaration with this digest');
        return toReceipt(row);
    });
}
