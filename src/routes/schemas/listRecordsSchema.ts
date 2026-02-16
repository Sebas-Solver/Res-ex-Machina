import { z } from 'zod';

const ETH_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

/**
 * Schema para los query params de GET /v1/records (Issue #21).
 *
 * - agent_wallet: obligatorio, filtra por wallet del agente
 * - state, content_type, tag: filtros opcionales
 * - from, to: rango de fechas (ISO 8601)
 * - limit, offset: paginación
 * - sort: orden de resultados
 */
export const listRecordsQuerySchema = z.object({
    agent_wallet: z.string().regex(ETH_ADDRESS_REGEX, 'Must be valid EVM address'),

    state: z.enum(['pending_anchor', 'anchored', 'anchor_failed']).optional(),
    content_type: z.string().min(1).max(127).optional(),
    tag: z.string().min(1).max(64).optional(),

    from: z.string().datetime({ message: 'Must be ISO-8601' }).optional(),
    to: z.string().datetime({ message: 'Must be ISO-8601' }).optional(),

    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),

    sort: z.enum(['created_at_asc', 'created_at_desc']).default('created_at_desc'),
});

export type ListRecordsQuery = z.infer<typeof listRecordsQuerySchema>;
