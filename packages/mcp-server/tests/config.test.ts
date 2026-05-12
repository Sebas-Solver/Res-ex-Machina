import { envSchema } from '../src/config';

describe('Config Schema Validation', () => {
  it('should use default values for missing variables', () => {
    const result = envSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.MCP_ENABLE_WRITE_TOOLS).toBe(false);
      expect(result.data.MCP_CONFIRMATION_MODE).toBe('require');
      expect(result.data.MCP_CHAIN_ID).toBe(84532);
    }
  });

  it('should allow automation when confirmation mode is auto', () => {
    const result = envSchema.safeParse({ MCP_CONFIRMATION_MODE: 'auto' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.MCP_CONFIRMATION_MODE).toBe('auto');
    }
  });

  it('should fail if invalid URL is provided', () => {
    const result = envSchema.safeParse({ MCP_API_URL: 'invalid-url' });
    expect(result.success).toBe(false);
  });
});
