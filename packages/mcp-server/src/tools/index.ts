// SPDX-License-Identifier: Apache-2.0
/**
 * Tools Barrel — Orchestrates tool registration based on configuration.
 *
 * Registration order (CTO-approved architecture):
 *   1. Read-only tools (always)
 *   2. Wallet balance (conditional: only if wallet configured)
 *   3. Control tools (only if write enabled + key present)
 *   4. Write tools (only if write enabled + key present)
 *   5. Batch tools (only if write enabled + batch enabled)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getConfig } from '../config.js';
import { isWriteCapable } from '../crypto-sidecar.js';
import { registerReadOnlyTools } from './read-only.js';
import { registerControlTools } from './control.js';
import { registerWriteTools } from './write.js';
import { registerBatchTools } from './batch.js';
import { logger } from '../logger.js';

export interface ToolRegistrationResult {
  readOnly: string[];
  control: string[];
  write: string[];
  batch: string[];
  total: number;
}

/**
 * Register all applicable tools based on configuration and sidecar state.
 * Returns a summary of what was registered for startup logging.
 */
export function registerAllTools(server: McpServer): ToolRegistrationResult {
  const config = getConfig();
  const result: ToolRegistrationResult = {
    readOnly: [],
    control: [],
    write: [],
    batch: [],
    total: 0,
  };

  // 1. Read-only tools — always registered
  result.readOnly = registerReadOnlyTools(server);

  // 2+3+4. Write + Control tools — only if write-capable
  if (config.MCP_ENABLE_WRITE_TOOLS && isWriteCapable()) {
    result.control = registerControlTools(server);
    result.write = registerWriteTools(server);

    // 5. Batch tools — double opt-in
    if (config.MCP_ENABLE_BATCH_TOOLS) {
      result.batch = registerBatchTools(server);
    }
  } else if (config.MCP_ENABLE_WRITE_TOOLS && !isWriteCapable()) {
    // This case is handled in config.ts (forces read-only),
    // but log here as well for visibility
    logger.warn('Write tools were requested but crypto sidecar is not write-capable');
  }

  result.total = result.readOnly.length + result.control.length + result.write.length + result.batch.length;

  // Startup summary log
  const mode = result.write.length > 0 ? 'READ-WRITE' : 'READ-ONLY';
  logger.info(`MCP tools registered — mode: ${mode}`, {
    readOnly: result.readOnly,
    control: result.control,
    write: result.write,
    batch: result.batch,
    total: result.total,
  });

  return result;
}

// Re-export individual registrations for testing
export { registerReadOnlyTools } from './read-only.js';
export { registerControlTools } from './control.js';
export { registerWriteTools } from './write.js';
export { registerBatchTools } from './batch.js';
