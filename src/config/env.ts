// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import 'dotenv/config';

/**
 * Validation schema for environment variables.
 * If a required variable is missing, the app will not start.
 */
const envSchema = z.object({
    // Server
    PORT: z.coerce.number().default(3000),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    // Database
    DATABASE_URL: z.string().url(),

    // Redis
    REDIS_URL: z.string().url(),

    // Blockchain L2
    L2_RPC_URL: z.string().url(),
    L2_CHAIN_ID: z.coerce.number().int().positive(),
    FEE_RECEIVER_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    FEE_MINIMUM_AMOUNT: z.coerce.number().positive(),
    FEE_TX_MAX_AGE_HOURS: z.coerce.number().positive().default(24),

    // Anchoring
    ANCHOR_WALLET_PRIVATE_KEY: z.string().regex(/^0x[a-fA-F0-9]{64}$/),

    // API (optional — for auto-generated links in responses)
    API_BASE_URL: z.string().url().optional(),

    // Sentry (Issue #19 — error monitoring)
    SENTRY_DSN: z.string().url().optional(),

    // Admin dashboard
    ADMIN_API_KEY: z.string().min(32).optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
    const result = envSchema.safeParse(process.env);

    if (!result.success) {
        console.error('❌ Invalid environment variables:');
        console.error(result.error.format());
        process.exit(1);
    }

    return result.data;
}

export const env = loadEnv();
