import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import os from 'os';

// Load .env.local if present
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

export const envSchema = z.object({
  MCP_TRANSPORT: z.enum(['stdio']).default('stdio'),
  MCP_API_URL: z.string().url().default('https://res-ex-machina-api.onrender.com/v1'),
  MCP_RPC_URL: z.string().url().default('https://sepolia.base.org'),
  MCP_CHAIN_ID: z.coerce.number().default(84532),
  MCP_ALLOWED_CHAIN_IDS: z.string().transform(s => s.split(',').map(Number)).default('84532'),
  MCP_ALLOW_MAINNET: z.enum(['true', 'false']).transform(v => v === 'true').default('false'),
  MCP_FEE_RECEIVER_ADDRESS: z.string().startsWith('0x').optional(),
  
  // Auth & Permissions
  MCP_PRIVATE_KEY: z.string().startsWith('0x').optional(),
  MCP_ENABLE_WRITE_TOOLS: z.enum(['true', 'false']).transform(v => v === 'true').default('false'),
  MCP_CONFIRMATION_MODE: z.enum(['require', 'auto', 'dry-run']).default('require'),
  MCP_RECORDING_POLICY: z.enum(['explicit', 'implicit']).default('explicit'),

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
});

export type EnvConfig = z.infer<typeof envSchema>;

let cachedConfig: EnvConfig | null = null;

export function getConfig(): EnvConfig {
  if (!cachedConfig) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      console.error("Invalid environment configuration:");
      parsed.error.errors.forEach(e => {
        console.error(`- ${e.path.join('.')}: ${e.message}`);
      });
      process.exit(1);
    }
    
    cachedConfig = parsed.data;
    
    // Safety check: Cannot enable write tools without a private key
    if (cachedConfig.MCP_ENABLE_WRITE_TOOLS && !cachedConfig.MCP_PRIVATE_KEY) {
      console.error("CRITICAL ERROR: MCP_ENABLE_WRITE_TOOLS is true but MCP_PRIVATE_KEY is missing. Starting in read-only mode.");
      cachedConfig.MCP_ENABLE_WRITE_TOOLS = false;
    }
    
    // Mainnet safety check
    if (!cachedConfig.MCP_ALLOW_MAINNET) {
      const mainnetChains = [1, 8453, 10, 42161];
      const hasMainnet = cachedConfig.MCP_ALLOWED_CHAIN_IDS.some(id => mainnetChains.includes(id));
      if (hasMainnet || mainnetChains.includes(cachedConfig.MCP_CHAIN_ID)) {
         console.error("CRITICAL ERROR: Mainnet chain ID detected but MCP_ALLOW_MAINNET is false.");
         process.exit(1);
      }
    }
  }
  return cachedConfig;
}

export function setConfirmationMode(mode: 'require' | 'auto' | 'dry-run'): void {
  if (cachedConfig) {
    cachedConfig.MCP_CONFIRMATION_MODE = mode;
  }
}
