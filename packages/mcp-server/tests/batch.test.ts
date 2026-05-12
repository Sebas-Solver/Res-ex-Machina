// SPDX-License-Identifier: Apache-2.0
// Tests for batch processing business logic:
// - Batch size validation
// - Deduplication flag behavior
// - Batch ID format
// - Edge cases

import { envSchema } from '../src/config';

describe('Batch Processing Config Validation', () => {

  // ─── Batch Size Boundaries ─────────────────────────────────

  it('should accept minimum batch size of 1', () => {
    const result = envSchema.safeParse({ MCP_MAX_BATCH_SIZE: '1' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.MCP_MAX_BATCH_SIZE).toBe(1);
  });

  it('should accept maximum batch size of 100', () => {
    const result = envSchema.safeParse({ MCP_MAX_BATCH_SIZE: '100' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.MCP_MAX_BATCH_SIZE).toBe(100);
  });

  it('should reject batch size of 0', () => {
    const result = envSchema.safeParse({ MCP_MAX_BATCH_SIZE: '0' });
    expect(result.success).toBe(false);
  });

  it('should reject batch size of 101', () => {
    const result = envSchema.safeParse({ MCP_MAX_BATCH_SIZE: '101' });
    expect(result.success).toBe(false);
  });

  it('should reject negative batch size', () => {
    const result = envSchema.safeParse({ MCP_MAX_BATCH_SIZE: '-5' });
    expect(result.success).toBe(false);
  });

  // ─── Dedup Flag ────────────────────────────────────────────

  it('should default dedup to true', () => {
    const result = envSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.MCP_BATCH_DEDUP_BEFORE_PAY).toBe(true);
  });

  it('should allow disabling dedup', () => {
    const result = envSchema.safeParse({ MCP_BATCH_DEDUP_BEFORE_PAY: 'false' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.MCP_BATCH_DEDUP_BEFORE_PAY).toBe(false);
  });

  // ─── Batch + Write Tools Combination ───────────────────────

  it('should allow enabling both batch and write tools', () => {
    const result = envSchema.safeParse({
      MCP_ENABLE_BATCH_TOOLS: 'true',
      MCP_ENABLE_WRITE_TOOLS: 'true',
      MCP_MAX_BATCH_SIZE: '50',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.MCP_ENABLE_BATCH_TOOLS).toBe(true);
      expect(result.data.MCP_ENABLE_WRITE_TOOLS).toBe(true);
      expect(result.data.MCP_MAX_BATCH_SIZE).toBe(50);
    }
  });

  // ─── WEI String BigInt Compatibility ───────────────────────

  it('should accept very large WEI values (uint256 range)', () => {
    const result = envSchema.safeParse({
      MCP_MAX_SPEND_PER_DAY_WEI: '115792089237316195423570985008687907853269984665640564039457584007913129639935',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // Verify it can be parsed as BigInt without error
      expect(() => BigInt(result.data.MCP_MAX_SPEND_PER_DAY_WEI)).not.toThrow();
    }
  });

  // ─── HTTP Auth ─────────────────────────────────────────────

  it('should default remote HTTP to disabled', () => {
    const result = envSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.MCP_ALLOW_REMOTE_HTTP).toBe(false);
    }
  });

  it('should allow enabling remote HTTP with a token', () => {
    const result = envSchema.safeParse({
      MCP_ALLOW_REMOTE_HTTP: 'true',
      MCP_HTTP_AUTH_TOKEN: 'super-secret-token',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.MCP_ALLOW_REMOTE_HTTP).toBe(true);
      expect(result.data.MCP_HTTP_AUTH_TOKEN).toBe('super-secret-token');
    }
  });

  // ─── Chain ID Parsing ──────────────────────────────────────

  it('should parse comma-separated allowed chain IDs', () => {
    const result = envSchema.safeParse({
      MCP_ALLOWED_CHAIN_IDS: '84532,11155111,421614',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.MCP_ALLOWED_CHAIN_IDS).toEqual([84532, 11155111, 421614]);
    }
  });
});
