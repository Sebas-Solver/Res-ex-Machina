import { z } from 'zod';
import 'dotenv/config';

/**
 * Schema de validación para variables de entorno.
 * Si falta alguna variable obligatoria, la app no arranca.
 */
const envSchema = z.object({
    // Servidor
    PORT: z.coerce.number().default(3000),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    // Base de datos
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
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
    const result = envSchema.safeParse(process.env);

    if (!result.success) {
        console.error('❌ Variables de entorno inválidas:');
        console.error(result.error.format());
        process.exit(1);
    }

    return result.data;
}

export const env = loadEnv();
