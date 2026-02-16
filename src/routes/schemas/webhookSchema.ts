import { z } from 'zod';

/**
 * Schemas para los endpoints de webhooks (Issue #13).
 */

/**
 * Schema para POST /v1/webhooks.
 * Solo acepta URLs HTTPS (mitigación SSRF).
 * El campo `secret` NO se envía — lo genera el servidor.
 */
export const createWebhookSchema = z.object({
    url: z
        .string()
        .url('Must be a valid URL')
        .max(2048, 'URL must be at most 2048 characters')
        .refine((u) => u.startsWith('https://'), {
            message: 'Only HTTPS URLs are allowed (SSRF mitigation)',
        }),
    events: z
        .array(z.enum(['state_changed']))
        .min(1)
        .max(5)
        .default(['state_changed']),
});

export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;
