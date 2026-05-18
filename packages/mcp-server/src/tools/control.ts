// SPDX-License-Identifier: Apache-2.0
/**
 * Control Tools — Available only when write tools are enabled.
 *
 * CTO Correction 1: rxm_set_confirmation_mode is NOT a read-only tool.
 * Changing confirmation mode modifies future agent behavior — it belongs
 * behind the write-tools gate.
 *
 * Rules:
 *   - Only available if MCP_ENABLE_WRITE_TOOLS=true
 *   - Cannot activate 'auto' if MCP_ALLOW_AUTO_MODE=false
 *   - Always requires mandatory reason for 'auto' mode
 *   - Audited in ledger
 */

import { z } from 'zod';
import { randomUUID } from 'crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { setConfirmationMode } from '../config.js';
import { getPublicAddress } from '../crypto-sidecar.js';
import { SqliteLedger, type Ledger } from '../ledger/index.js';

const ledger: Ledger = new SqliteLedger();

export function registerControlTools(server: McpServer): string[] {
  const registered: string[] = [];
  const publicAddress = getPublicAddress();

  // Audit: Log process start (restart resets confirmation mode to 'require')
  try {
    ledger.recordAuditEvent({
      eventId: randomUUID(),
      eventType: 'confirmation_mode_reset',
      actorWallet: publicAddress || null,
      actorType: 'system',
      previousValue: null,
      newValue: 'require',
      reason: 'process_restart_safe_default',
      requestId: null,
    });
  } catch {
    // Don't block server startup if ledger is not yet ready
  }

  // @ts-expect-error — TS2589: Known MCP SDK issue with deep Zod schema inference
  server.tool(
    "rxm_set_confirmation_mode",
    "Updates the confirmation mode for the MCP server. Allowed values: 'require' (human must review), 'auto' (fully automated with guardrails — requires reason), 'dry-run' (simulates transactions). Changing to 'auto' requires MCP_ALLOW_AUTO_MODE=true and a mandatory reason.",
    {
      mode: z.enum(['require', 'auto', 'dry-run']).describe("The new confirmation mode"),
      reason: z.string().optional().describe("Mandatory reason when switching to 'auto' mode. Optional for other modes.")
    },
    async ({ mode, reason }) => {
      const result = setConfirmationMode(mode, reason);

      if (!result.allowed) {
        return {
          content: [{
            type: "text",
            text: `❌ Mode change rejected: ${result.reason}`
          }]
        };
      }

      // Record the mode change as an audit event
      ledger.recordAuditEvent({
        eventId: randomUUID(),
        eventType: 'confirmation_mode_change',
        actorWallet: publicAddress || null,
        actorType: 'agent',
        previousValue: result.previousMode,
        newValue: mode,
        reason: reason || `Mode changed to ${mode}`,
        requestId: randomUUID(),
      });

      return {
        content: [{
          type: "text",
          text: `Confirmation mode updated: ${result.previousMode} → ${mode}` +
                (reason ? ` (reason: ${reason})` : '') +
                ` [audit event recorded]`
        }]
      };
    }
  );
  registered.push('rxm_set_confirmation_mode');

  return registered;
}
