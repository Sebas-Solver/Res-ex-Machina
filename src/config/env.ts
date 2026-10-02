// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import 'dotenv/config';
import { envBool } from './envBool.js';


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

    // rxm-pog-v2 (spec/rxm-pog-v2.md). Off unless explicitly enabled: it is also the kill switch.
    V2_ENABLED: envBool(false),
    /** RxMAnchor deployment on L2_CHAIN_ID; required when V2_ENABLED=true */
    ANCHOR_CONTRACT_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
    /** Declarations accepted per agent per rolling 24 h (RxM pays the gas) */
    V2_AGENT_DAILY_QUOTA: z.coerce.number().int().positive().default(50),
    /** Declarations accepted in total per rolling 24 h */
    V2_GLOBAL_DAILY_QUOTA: z.coerce.number().int().positive().default(2000),

    // API (optional — for auto-generated links in responses)
    API_BASE_URL: z.string().url().optional(),

    // Sentry (Issue #19 — error monitoring)
    SENTRY_DSN: z.string().url().optional(),

    // Admin dashboard
    ADMIN_API_KEY: z.string().min(32).optional(),

    // x402
    X402_ENABLED: envBool(false),
    X402_REQUIRE_PAYMENT_IDENTIFIER: envBool(true),
    X402_FACILITATOR_URL: z.string().url().default('https://x402.org/facilitator'),
    X402_USDC_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).default('0x036CbD53842c5426634e7929541eC2318f3dCF7e'),
    X402_RECEIVER_PRIVATE_KEY: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
    const result = envSchema
        .refine((e) => !e.V2_ENABLED || !!e.ANCHOR_CONTRACT_ADDRESS, {
            message: 'ANCHOR_CONTRACT_ADDRESS is required when V2_ENABLED=true',
            path: ['ANCHOR_CONTRACT_ADDRESS'],
        })
        .safeParse(process.env);

    if (!result.success) {
        console.error('❌ Invalid environment variables:');
        console.error(result.error.format());
        process.exit(1);
    }

    return result.data;
}

export const env = loadEnv();
