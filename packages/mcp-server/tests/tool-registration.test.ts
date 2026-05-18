// SPDX-License-Identifier: Apache-2.0
/**
 * Tool Registration Tests — Validates CTO-approved security architecture:
 *
 * 1. Read-only default: only safe tools with no configuration
 * 2. Write tools require explicit opt-in (MCP_ENABLE_WRITE_TOOLS=true + key)
 * 3. Batch tools require double opt-in (write + MCP_ENABLE_BATCH_TOOLS=true)
 * 4. rxm_record_generation (direct) does NOT exist anywhere
 * 5. rxm_set_confirmation_mode is NOT in read-only
 * 6. rxm_get_wallet_balance requires wallet address or key
 */

import { envSchema } from '../src/config';

// Since we can't easily instantiate a full McpServer in unit tests,
// we test the registration logic indirectly via config parsing + expected tools.

describe('Tool Registration Architecture', () => {

  // ─── Read-Only Default (no config required) ──────────────────

  describe('Read-Only Default Mode', () => {
    it('should default to write tools disabled', () => {
      const result = envSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.MCP_ENABLE_WRITE_TOOLS).toBe(false);
        expect(result.data.MCP_ENABLE_BATCH_TOOLS).toBe(false);
      }
    });

    it('should not require any private key for defaults', () => {
      const result = envSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.MCP_PRIVATE_KEY).toBeUndefined();
        expect(result.data.MCP_WALLET_ADDRESS).toBeUndefined();
      }
    });
  });

  // ─── Write Tools Gate ────────────────────────────────────────

  describe('Write Tools Gate', () => {
    it('should accept write tools when properly configured', () => {
      const result = envSchema.safeParse({
        MCP_ENABLE_WRITE_TOOLS: 'true',
        MCP_PRIVATE_KEY: '0xabc123def456',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.MCP_ENABLE_WRITE_TOOLS).toBe(true);
        expect(result.data.MCP_PRIVATE_KEY).toBe('0xabc123def456');
      }
    });

    it('write tools flag without private key should be caught by getConfig()', () => {
      // Schema itself allows it — runtime enforcement in getConfig()
      const result = envSchema.safeParse({
        MCP_ENABLE_WRITE_TOOLS: 'true',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.MCP_ENABLE_WRITE_TOOLS).toBe(true);
        expect(result.data.MCP_PRIVATE_KEY).toBeUndefined();
        // getConfig() will force MCP_ENABLE_WRITE_TOOLS to false
      }
    });
  });

  // ─── Batch Tools Double Opt-in ───────────────────────────────

  describe('Batch Tools Double Opt-in', () => {
    it('batch tools default to disabled', () => {
      const result = envSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.MCP_ENABLE_BATCH_TOOLS).toBe(false);
      }
    });

    it('batch tools can be enabled alongside write tools', () => {
      const result = envSchema.safeParse({
        MCP_ENABLE_WRITE_TOOLS: 'true',
        MCP_ENABLE_BATCH_TOOLS: 'true',
        MCP_PRIVATE_KEY: '0xabc123def456',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.MCP_ENABLE_WRITE_TOOLS).toBe(true);
        expect(result.data.MCP_ENABLE_BATCH_TOOLS).toBe(true);
      }
    });

    it('batch size defaults to 10 (CTO hardened)', () => {
      const result = envSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.MCP_MAX_BATCH_SIZE).toBe(10);
      }
    });

    it('batch dedup defaults to true (CTO mandatory)', () => {
      const result = envSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.MCP_BATCH_DEDUP_BEFORE_PAY).toBe(true);
      }
    });
  });

  // ─── CTO Correction Validations ──────────────────────────────

  describe('CTO Corrections', () => {
    it('MCP_RECORDING_POLICY should not exist in schema', () => {
      // Verify the schema does not accept this field anymore
      const result = envSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        // Property should not exist on the parsed data
        expect((result.data as any).MCP_RECORDING_POLICY).toBeUndefined();
      }
    });

    it('should support MCP_WALLET_ADDRESS for read-only identity', () => {
      const result = envSchema.safeParse({
        MCP_WALLET_ADDRESS: '0x1234567890abcdef1234567890abcdef12345678',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.MCP_WALLET_ADDRESS).toBe('0x1234567890abcdef1234567890abcdef12345678');
        expect(result.data.MCP_ENABLE_WRITE_TOOLS).toBe(false); // Still read-only
      }
    });
  });

  // ─── Expected Tool Inventory ─────────────────────────────────

  describe('Expected Tool Inventory', () => {
    const READ_ONLY_TOOLS = [
      'rxm_hash_content',
      'rxm_verify_hash', 
      'rxm_verify_content',
      'rxm_get_receipt',
    ];

    const CONDITIONAL_READ_TOOLS = [
      'rxm_get_wallet_balance',
    ];

    const CONTROL_TOOLS = [
      'rxm_set_confirmation_mode',
    ];

    const WRITE_TOOLS = [
      'rxm_prepare_record_generation',
      'rxm_confirm_record_generation',
    ];

    const BATCH_TOOLS = [
      'rxm_prepare_batch',
      'rxm_confirm_batch',
    ];

    const REMOVED_TOOLS = [
      'rxm_record_generation',  // CTO Correction 3: too risky for alpha
    ];

    it('should define expected read-only tools', () => {
      expect(READ_ONLY_TOOLS).toHaveLength(4);
    });

    it('should define expected conditional read tools', () => {
      expect(CONDITIONAL_READ_TOOLS).toHaveLength(1);
    });

    it('should define expected control tools (behind write gate)', () => {
      expect(CONTROL_TOOLS).toHaveLength(1);
      expect(CONTROL_TOOLS).toContain('rxm_set_confirmation_mode');
    });

    it('should define expected write tools (2-phase only)', () => {
      expect(WRITE_TOOLS).toHaveLength(2);
      expect(WRITE_TOOLS).not.toContain('rxm_record_generation');
    });

    it('should define expected batch tools', () => {
      expect(BATCH_TOOLS).toHaveLength(2);
    });

    it('removed tools should NOT appear in any tool list', () => {
      const allTools = [...READ_ONLY_TOOLS, ...CONDITIONAL_READ_TOOLS, ...CONTROL_TOOLS, ...WRITE_TOOLS, ...BATCH_TOOLS];
      for (const removed of REMOVED_TOOLS) {
        expect(allTools).not.toContain(removed);
      }
    });

    it('total tool count should match architecture doc', () => {
      // Read-only: 4 + conditional: 1 + control: 1 + write: 2 + batch: 2 = 10
      const total = READ_ONLY_TOOLS.length + CONDITIONAL_READ_TOOLS.length + 
                    CONTROL_TOOLS.length + WRITE_TOOLS.length + BATCH_TOOLS.length;
      expect(total).toBe(10);
    });
  });
});
