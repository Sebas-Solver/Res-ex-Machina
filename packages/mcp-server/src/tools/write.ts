// SPDX-License-Identifier: Apache-2.0
/**
 * Write Tools — Require MCP_ENABLE_WRITE_TOOLS=true + MCP_PRIVATE_KEY.
 *
 * CTO Correction 3: rxm_record_generation (direct) is REMOVED from the
 * public package. Only the 2-phase commit flow remains:
 *   - rxm_prepare_record_generation  (Phase 1: prepare + cost estimate)
 *   - rxm_confirm_record_generation  (Phase 2: confirm + execute)
 *
 * This ensures all registrations go through explicit human/agent review.
 */

import { z } from 'zod';
import { randomUUID } from 'crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { computeContentHash } from '@res-ex-machina/sdk';
import { getConfig } from '../config.js';
import { getRxmClient } from '../crypto-sidecar.js';
import { SqliteLedger, type Ledger } from '../ledger/index.js';

const ledger: Ledger = new SqliteLedger();

// ─── In-memory confirmation store ──────────────────────────────
interface ConfirmationRequest {
  id: string;
  args: any;
  feeWei: bigint;
  gasCostWei: bigint;
  expiresAt: number;
}
const pendingConfirmations = new Map<string, ConfirmationRequest>();
const MAX_PENDING_CONFIRMATIONS = 1000;

// Audit M-01: Periodic GC for expired confirmations
setInterval(() => {
  const now = Date.now();
  for (const [id, req] of pendingConfirmations) {
    if (now > req.expiresAt) pendingConfirmations.delete(id);
  }
}, 60_000).unref();

export function registerWriteTools(server: McpServer): string[] {
  const registered: string[] = [];
  const config = getConfig();
  const rxmClient = getRxmClient();

  // @ts-expect-error — TS2589: Known MCP SDK issue with deep Zod schema inference
  server.tool(
    "rxm_prepare_record_generation",
    "Phase 1 of 2: Prepares a record for generation, runs checks, and returns a confirmation_id.",
    {
      content: z.string().optional().describe("The generated content to record"),
      content_hash: z.string().optional().describe("The pre-calculated SHA-256 hash"),
      model_id: z.string().describe("The ID of the AI model used"),
      tags: z.array(z.string()).optional().describe("Optional tags for categorization"),
      content_type: z.string().optional().describe("MIME type of the content (default: text/plain)"),
      human_intervention: z.enum(['none', 'prompt_only', 'supervised', 'collaborative', 'unknown']).optional().describe("Description of human edits.")
    },
    async (args) => {
      try {
        if (!args.content && !args.content_hash) {
          throw new Error("Must provide either 'content' or 'content_hash'");
        }

        let targetHash = args.content_hash;
        if (!targetHash && args.content) {
          targetHash = await computeContentHash(args.content);
        }

        // Duplicate check
        const verify = await rxmClient.verify(targetHash as string);
        if (verify.exists) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                ok: true,
                message: "Record already exists on-chain. Skipping registration.",
                record: { recordId: verify.recordId, state: verify.state, receiptHash: verify.receiptHash }
              }, null, 2)
            }]
          };
        }

        const feeWei = BigInt(config.MCP_MAX_RXM_FEE_WEI);
        const gasCostWei = BigInt(100000) * BigInt(2000000000);
        
        const guardrails = ledger.checkGuardrails(feeWei, gasCostWei);
        if (!guardrails.allowed) {
          ledger.recordFailedAttempt(randomUUID(), `Guardrail blocked prepare: ${guardrails.reason}`);
          throw new Error(`Guardrail blocked transaction: ${guardrails.reason}`);
        }

        const confirmationId = randomUUID();
        if (pendingConfirmations.size >= MAX_PENDING_CONFIRMATIONS) {
          throw new Error('Too many pending confirmations. Please confirm or wait for expiration.');
        }
        pendingConfirmations.set(confirmationId, {
          id: confirmationId,
          args,
          feeWei,
          gasCostWei,
          expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes
        });

        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify({
              ok: true,
              confirmation_id: confirmationId,
              content_hash: targetHash,
              predicted_fee_wei: feeWei.toString(),
              predicted_gas_wei: gasCostWei.toString(),
              message: "Preparation complete. Use rxm_confirm_record_generation to finalize."
            }, null, 2) 
          }]
        };

      } catch (error: any) {
        return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
      }
    }
  );
  registered.push('rxm_prepare_record_generation');

  server.tool(
    "rxm_confirm_record_generation",
    "Phase 2 of 2: Confirms a previously prepared generation using its confirmation_id.",
    {
      confirmation_id: z.string().describe("The ID returned by rxm_prepare_record_generation")
    },
    async ({ confirmation_id }) => {
      try {
        const req = pendingConfirmations.get(confirmation_id);
        if (!req) {
          throw new Error("Invalid or expired confirmation_id");
        }
        if (Date.now() > req.expiresAt) {
          pendingConfirmations.delete(confirmation_id);
          throw new Error("Confirmation request expired");
        }

        pendingConfirmations.delete(confirmation_id); // Consume it

        // Verify guardrails again
        const guardrails = ledger.checkGuardrails(req.feeWei, req.gasCostWei);
        if (!guardrails.allowed) {
          ledger.recordFailedAttempt(confirmation_id, `Guardrail blocked confirm: ${guardrails.reason}`);
          throw new Error(`Guardrail blocked transaction: ${guardrails.reason}`);
        }

        const args = req.args;
        let targetHash = args.content_hash;
        if (!targetHash && args.content) {
          targetHash = await computeContentHash(args.content);
        }
        if (args.content && args.content_hash) {
          const computed = await computeContentHash(args.content);
          if (computed !== args.content_hash) {
            throw new Error("Provided content does not match provided content_hash");
          }
        }

        const tags = [...(args.tags || []), ...config.MCP_DEFAULT_TAGS];

        const record = await rxmClient.recordHash(targetHash as string, {
          modelId: args.model_id,
          tags: tags,
          contentType: args.content_type,
          paymentMode: config.MCP_PAYMENT_MODE as "legacy" | "x402"
        });

        ledger.recordTransaction(
           record.recordId,
           "0x_rxm_sdk_internal",
           req.feeWei,
           req.gasCostWei
        );

        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify({
              ok: true,
              record_id: record.recordId,
              content_hash: targetHash,
              state: record.state,
              message: "Record created successfully."
            }, null, 2) 
          }]
        };

      } catch (error: any) {
        return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
      }
    }
  );
  registered.push('rxm_confirm_record_generation');

  // NOTE: rxm_record_generation (direct) intentionally REMOVED from public package.
  // CTO decision: "fuera del paquete público por ahora — menos superficie para alpha."

  return registered;
}
