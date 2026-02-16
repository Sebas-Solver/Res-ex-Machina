import { z } from 'zod';
import { createRecordSchema } from './index.js';

/**
 * Schema para el endpoint POST /v1/records/batch (Issue #12).
 *
 * Acepta un array de 1 a 100 records, cada uno con la misma
 * estructura que el POST individual.
 */
export const batchRequestSchema = z.object({
    records: z.array(createRecordSchema).min(1, 'Batch must contain at least 1 record').max(100, 'Batch cannot exceed 100 records'),
});

export type BatchRequest = z.infer<typeof batchRequestSchema>;
