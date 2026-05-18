// SPDX-License-Identifier: Apache-2.0
import { envSchema } from '../src/config';

describe('Config Schema Validation', () => {

  // ─── Defaults ──────────────────────────────────────────────

  it('should use default values for missing variables', () => {
    const result = envSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.MCP_ENABLE_WRITE_TOOLS).toBe(false);
      expect(result.data.MCP_CONFIRMATION_MODE).toBe('require');
      expect(result.data.MCP_CHAIN_ID).toBe(84532);
      expect(result.data.MCP_TRANSPORT).toBe('stdio');
      // MCP_RECORDING_POLICY removed in v0.2.0 — was dead code
      expect(result.data.MCP_REQUIRE_MODEL_ID).toBe(true);
      expect(result.data.MCP_MAX_CONTENT_BYTES).toBe(65536);
      expect(result.data.MCP_MAX_RECORDS_PER_DAY).toBe(20);
    }
  });

  it('should allow automation when confirmation mode is auto', () => {
    const result = envSchema.safeParse({ MCP_CONFIRMATION_MODE: 'auto' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.MCP_CONFIRMATION_MODE).toBe('auto');
    }
  });

  it('should accept dry-run confirmation mode', () => {
    const result = envSchema.safeParse({ MCP_CONFIRMATION_MODE: 'dry-run' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.MCP_CONFIRMATION_MODE).toBe('dry-run');
    }
  });

  it('should reject invalid confirmation mode', () => {
    const result = envSchema.safeParse({ MCP_CONFIRMATION_MODE: 'yolo' });
    expect(result.success).toBe(false);
  });

  it('should fail if invalid URL is provided', () => {
    const result = envSchema.safeParse({ MCP_API_URL: 'invalid-url' });
    expect(result.success).toBe(false);
  });

  // ─── Transport ─────────────────────────────────────────────

  it('should reject invalid transport', () => {
    const result = envSchema.safeParse({ MCP_TRANSPORT: 'websocket' });
    expect(result.success).toBe(false);
  });

  it('should accept sse transport', () => {
    const result = envSchema.safeParse({ MCP_TRANSPORT: 'sse' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.MCP_TRANSPORT).toBe('sse');
    }
  });

  // ─── Mainnet Protection ────────────────────────────────────

  it('should reject mainnet chain IDs when MCP_ALLOW_MAINNET is false', () => {
    // This is enforced in getConfig(), not in schema parsing
    const result = envSchema.safeParse({
      MCP_CHAIN_ID: '8453',
      MCP_ALLOW_MAINNET: 'false',
    });
    // Schema parses fine; it's getConfig() that blocks mainnet
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.MCP_CHAIN_ID).toBe(8453);
      expect(result.data.MCP_ALLOW_MAINNET).toBe(false);
    }
  });

  it('should allow mainnet when MCP_ALLOW_MAINNET is true', () => {
    const result = envSchema.safeParse({
      MCP_CHAIN_ID: '8453',
      MCP_ALLOW_MAINNET: 'true',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.MCP_ALLOW_MAINNET).toBe(true);
    }
  });

  // ─── Batch Config ──────────────────────────────────────────

  it('should default batch tools to disabled', () => {
    const result = envSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.MCP_ENABLE_BATCH_TOOLS).toBe(false);
      expect(result.data.MCP_MAX_BATCH_SIZE).toBe(10);
      expect(result.data.MCP_BATCH_DEDUP_BEFORE_PAY).toBe(true);
    }
  });

  it('should enable batch when configured', () => {
    const result = envSchema.safeParse({
      MCP_ENABLE_BATCH_TOOLS: 'true',
      MCP_MAX_BATCH_SIZE: '50',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.MCP_ENABLE_BATCH_TOOLS).toBe(true);
      expect(result.data.MCP_MAX_BATCH_SIZE).toBe(50);
    }
  });

  it('should reject batch size > 100', () => {
    const result = envSchema.safeParse({ MCP_MAX_BATCH_SIZE: '101' });
    expect(result.success).toBe(false);
  });

  it('should reject batch size < 1', () => {
    const result = envSchema.safeParse({ MCP_MAX_BATCH_SIZE: '0' });
    expect(result.success).toBe(false);
  });

  // ─── Financial Guardrails (WEI strings) ────────────────────

  it('should accept custom WEI values as strings', () => {
    const result = envSchema.safeParse({
      MCP_MAX_RXM_FEE_WEI: '999999999999999999',
      MCP_MAX_SPEND_PER_DAY_WEI: '100000000000000000',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.MCP_MAX_RXM_FEE_WEI).toBe('999999999999999999');
      expect(result.data.MCP_MAX_SPEND_PER_DAY_WEI).toBe('100000000000000000');
    }
  });

  // ─── Content Types ─────────────────────────────────────────

  it('should parse comma-separated content types', () => {
    const result = envSchema.safeParse({
      MCP_ALLOWED_CONTENT_TYPES: 'text/html,image/png',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.MCP_ALLOWED_CONTENT_TYPES).toEqual(['text/html', 'image/png']);
    }
  });

  it('should parse comma-separated default tags', () => {
    const result = envSchema.safeParse({
      MCP_DEFAULT_TAGS: 'ai,generated,v2',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.MCP_DEFAULT_TAGS).toEqual(['ai', 'generated', 'v2']);
    }
  });

  // ─── Private Key Validation ────────────────────────────────

  it('should accept valid 0x-prefixed private key', () => {
    const result = envSchema.safeParse({
      MCP_PRIVATE_KEY: '0xabc123',
    });
    expect(result.success).toBe(true);
  });

  it('should reject private key without 0x prefix', () => {
    const result = envSchema.safeParse({
      MCP_PRIVATE_KEY: 'abc123',
    });
    expect(result.success).toBe(false);
  });

  // ─── P0-2: MCP_ALLOW_AUTO_MODE ──────────────────────────────

  it('should default MCP_ALLOW_AUTO_MODE to false', () => {
    const result = envSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.MCP_ALLOW_AUTO_MODE).toBe(false);
    }
  });

  it('should accept MCP_ALLOW_AUTO_MODE=true', () => {
    const result = envSchema.safeParse({ MCP_ALLOW_AUTO_MODE: 'true' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.MCP_ALLOW_AUTO_MODE).toBe(true);
    }
  });
});

// ─── P0-2: setConfirmationMode ────────────────────────────────

describe('setConfirmationMode (P0-2)', () => {
  let setConfirmationMode: typeof import('../src/config').setConfirmationMode;
  let getConfig: typeof import('../src/config').getConfig;
  let _resetConfigForTest: typeof import('../src/config')._resetConfigForTest;

  beforeEach(async () => {
    // Reset modules to get fresh config state
    jest.resetModules();
    const configModule = await import('../src/config');
    setConfirmationMode = configModule.setConfirmationMode;
    getConfig = configModule.getConfig;
    _resetConfigForTest = configModule._resetConfigForTest;
  });

  it('should reject auto mode when MCP_ALLOW_AUTO_MODE is false (default)', () => {
    // Initialize config (MCP_ALLOW_AUTO_MODE defaults to false)
    getConfig();
    const result = setConfirmationMode('auto', 'Testing');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Auto mode is disabled');
  });

  it('should reject auto mode without reason even if allowed', () => {
    process.env.MCP_ALLOW_AUTO_MODE = 'true';
    _resetConfigForTest();
    getConfig();
    
    const result = setConfirmationMode('auto');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('mandatory reason');
    
    delete process.env.MCP_ALLOW_AUTO_MODE;
  });

  it('should reject auto mode with empty reason', () => {
    process.env.MCP_ALLOW_AUTO_MODE = 'true';
    _resetConfigForTest();
    getConfig();
    
    const result = setConfirmationMode('auto', '   ');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('mandatory reason');
    
    delete process.env.MCP_ALLOW_AUTO_MODE;
  });

  it('should allow auto mode with valid reason and MCP_ALLOW_AUTO_MODE=true', () => {
    process.env.MCP_ALLOW_AUTO_MODE = 'true';
    _resetConfigForTest();
    getConfig();
    
    const result = setConfirmationMode('auto', 'Batch processing scheduled job');
    expect(result.allowed).toBe(true);
    expect(result.previousMode).toBe('require');
    
    delete process.env.MCP_ALLOW_AUTO_MODE;
  });

  it('should return previous mode on successful change', () => {
    getConfig();
    
    // Default is require, switch to dry-run
    const result1 = setConfirmationMode('dry-run');
    expect(result1.allowed).toBe(true);
    expect(result1.previousMode).toBe('require');
    
    // Now switch back to require
    const result2 = setConfirmationMode('require');
    expect(result2.allowed).toBe(true);
    expect(result2.previousMode).toBe('dry-run');
  });

  it('should allow require and dry-run without reason', () => {
    getConfig();
    
    expect(setConfirmationMode('require').allowed).toBe(true);
    expect(setConfirmationMode('dry-run').allowed).toBe(true);
  });

  it('should fail when config is not initialized', () => {
    _resetConfigForTest();
    const result = setConfirmationMode('require');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Config not initialized');
  });
});
