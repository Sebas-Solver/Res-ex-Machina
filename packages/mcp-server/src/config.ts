// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import os from 'os';
import { logger } from './logger.js';

// Load .env.local if present
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// CTO Condition 1: Support RXM_ prefixed aliases to avoid collisions
// with other MCPs. RXM_MCP_* takes precedence only if MCP_* is unset.
const RXM_ALIASES: [string, string][] = [
  ['RXM_MCP_ENABLE_WRITE_TOOLS', 'MCP_ENABLE_WRITE_TOOLS'],
  ['RXM_MCP_ENABLE_BATCH_TOOLS', 'MCP_ENABLE_BATCH_TOOLS'],
  ['RXM_MCP_PRIVATE_KEY', 'MCP_PRIVATE_KEY'],
  ['RXM_MCP_HTTP_AUTH_TOKEN', 'MCP_HTTP_AUTH_TOKEN'],
];
for (const [alias, canonical] of RXM_ALIASES) {
  if (process.env[alias] && !process.env[canonical]) {
    process.env[canonical] = process.env[alias];
  }
  delete process.env[alias]; // Sanitize alias after resolution
}

export const envSchema = z.object({
  MCP_TRANSPORT: z.enum(['stdio', 'sse']).default('stdio'),
  MCP_API_URL: z.string().url().default('https://res-ex-machina-api.onrender.com/v1'),
  MCP_RPC_URL: z.string().url().default('https://sepolia.base.org'),
  MCP_CHAIN_ID: z.coerce.number().default(84532),
  MCP_ALLOWED_CHAIN_IDS: z.string().transform(s => s.split(',').map(Number)).default('84532'),
  MCP_ALLOW_MAINNET: z.enum(['true', 'false']).transform(v => v === 'true').default('false'),
  MCP_FEE_RECEIVER_ADDRESS: z.string().startsWith('0x').optional(),
  
  // Auth & Permissions
  MCP_HTTP_AUTH_TOKEN: z.string().optional(),
  MCP_ALLOW_REMOTE_HTTP: z.enum(['true', 'false']).transform(v => v === 'true').default('false'),
  MCP_PRIVATE_KEY: z.string().startsWith('0x').optional(),
  MCP_WALLET_ADDRESS: z.string().startsWith('0x').optional(),
  MCP_ENABLE_WRITE_TOOLS: z.enum(['true', 'false']).transform(v => v === 'true').default('false'),
  MCP_CONFIRMATION_MODE: z.enum(['require', 'auto', 'dry-run']).default('require'),
  // P0-2: Default false ALWAYS. Auto mode is an explicit opt-in, not a default.
  // To enable in testnet, set MCP_ALLOW_AUTO_MODE=true in .env.local
  MCP_ALLOW_AUTO_MODE: z.enum(['true', 'false']).transform(v => v === 'true').default('false'),
  MCP_PAYMENT_MODE: z.enum(['legacy', 'x402']).default('x402'),
  // MCP_RECORDING_POLICY removed in v0.2.0 — was dead code (never used by any tool).
  // Recording behavior is now governed by tool enablement and confirmation mode.

  // Financial Guardrails (in WEI strings to prevent precision loss, parsed as BigInt)
  MCP_MAX_RXM_FEE_WEI: z.string().default('10000000000000000'), // 0.01 ETH
  MCP_MAX_GAS_COST_WEI: z.string().default('500000000000000'), // 0.0005 ETH
  MCP_MAX_TOTAL_TX_COST_WEI: z.string().default('10500000000000000'), // 0.0105 ETH
  MCP_MAX_SPEND_PER_DAY_WEI: z.string().default('50000000000000000'), // 0.05 ETH
  MCP_MAX_RECORDS_PER_DAY: z.coerce.number().default(20),
  MCP_SPEND_STATE_PATH: z.string().default(path.join(os.homedir(), '.rxm-mcp', 'state.sqlite')),

  // Protection
  MCP_MAX_CONTENT_BYTES: z.coerce.number().default(65536),
  MCP_ALLOWED_CONTENT_TYPES: z.string().transform(s => s.split(',')).default('text/plain,text/markdown,application/json'),
  MCP_DEFAULT_TAGS: z.string().transform(s => s.split(',')).default('mcp,rxm'),
  MCP_REQUIRE_MODEL_ID: z.enum(['true', 'false']).transform(v => v === 'true').default('true'),

  // Batch Processing
  MCP_ENABLE_BATCH_TOOLS: z.enum(['true', 'false']).transform(v => v === 'true').default('false'),
  MCP_MAX_BATCH_SIZE: z.coerce.number().min(1).max(100).default(10),
  MCP_BATCH_DEDUP_BEFORE_PAY: z.enum(['true', 'false']).transform(v => v === 'true').default('true'),
});

export type EnvConfig = z.infer<typeof envSchema>;

let cachedConfig: EnvConfig | null = null;

export function getConfig(): EnvConfig {
  if (!cachedConfig) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      logger.error('Invalid environment configuration', {
        errors: parsed.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
      });
      process.exit(1);
    }
    
    cachedConfig = parsed.data;

    // Security: Sanitize sensitive env vars after reading (Audit C-01)
    // Prevents exposure via memory dump, /proc/environ, or error logging
    delete process.env.MCP_PRIVATE_KEY;
    delete process.env.MCP_HTTP_AUTH_TOKEN;
    
    // Safety check: Cannot enable write tools without a private key
    if (cachedConfig.MCP_ENABLE_WRITE_TOOLS && !cachedConfig.MCP_PRIVATE_KEY) {
      logger.warn('Write tools requested but no signer configured; falling back to read-only');
      cachedConfig.MCP_ENABLE_WRITE_TOOLS = false;
    }
    
    // Mainnet safety check
    if (!cachedConfig.MCP_ALLOW_MAINNET) {
      const mainnetChains = [1, 8453, 10, 42161];
      const hasMainnet = cachedConfig.MCP_ALLOWED_CHAIN_IDS.some(id => mainnetChains.includes(id));
      if (hasMainnet || mainnetChains.includes(cachedConfig.MCP_CHAIN_ID)) {
         logger.fatal('Mainnet chain ID detected but MCP_ALLOW_MAINNET is false', { chainId: cachedConfig.MCP_CHAIN_ID });
         process.exit(1);
      }
    }

    // Startup mode log
    const mode = cachedConfig.MCP_ENABLE_WRITE_TOOLS ? 'READ-WRITE' : 'READ-ONLY';
    logger.info(`MCP config loaded — mode: ${mode}`, {
      writeTools: cachedConfig.MCP_ENABLE_WRITE_TOOLS,
      batchTools: cachedConfig.MCP_ENABLE_BATCH_TOOLS,
      confirmationMode: cachedConfig.MCP_CONFIRMATION_MODE,
      chainId: cachedConfig.MCP_CHAIN_ID,
    });
  }
  return cachedConfig;
}

/**
 * Changes the active confirmation mode.
 * P0-2: Returns the previous mode for audit trail. Validates auto mode restrictions.
 * @returns { previousMode, allowed, reason? }
 */
export function setConfirmationMode(
  mode: 'require' | 'auto' | 'dry-run',
  reason?: string
): { previousMode: string; allowed: boolean; reason?: string } {
  if (!cachedConfig) {
    return { previousMode: 'unknown', allowed: false, reason: 'Config not initialized' };
  }

  const previousMode = cachedConfig.MCP_CONFIRMATION_MODE;

  // P0-2: Auto mode requires explicit opt-in AND mandatory reason
  if (mode === 'auto') {
    if (!cachedConfig.MCP_ALLOW_AUTO_MODE) {
      return {
        previousMode,
        allowed: false,
        reason: 'Auto mode is disabled. Set MCP_ALLOW_AUTO_MODE=true to enable.',
      };
    }
    if (!reason || reason.trim().length === 0) {
      return {
        previousMode,
        allowed: false,
        reason: 'Switching to auto mode requires a mandatory reason.',
      };
    }
  }

  cachedConfig.MCP_CONFIRMATION_MODE = mode;
  return { previousMode, allowed: true };
}

/**
 * Test-only: Reset the cached config so getConfig() will re-parse env vars.
 * @internal
 */
export function _resetConfigForTest(): void {
  cachedConfig = null;
}
