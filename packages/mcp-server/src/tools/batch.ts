// SPDX-License-Identifier: Apache-2.0
/**
 * Batch Tools — Require double opt-in:
 *   MCP_ENABLE_WRITE_TOOLS=true  +  MCP_ENABLE_BATCH_TOOLS=true
 *
 * CTO restrictions:
 *   - Batch size default: 10 (not 100)
 *   - MCP_BATCH_DEDUP_BEFORE_PAY=true is mandatory
 *   - Confirmation mode forced to 'require' for batch ops
 *   - No auto-confirm in batch
 *   - Total cost estimate visible before confirmation
 */

import { z } from 'zod';
import { randomUUID } from 'crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { computeContentHash } from '@res-ex-machina/sdk';
import { getConfig } from '../config.js';
import { getRxmClient } from '../crypto-sidecar.js';
import { SqliteLedger, type Ledger } from '../ledger/index.js';

const ledger: Ledger = new SqliteLedger();

// ─── In-memory batch confirmation store ────────────────────────
interface BatchConfirmationRequest {
  batchId: string;
  newItems: { contentHash: string; args: any }[];
  duplicateHashes: string[];
  perItemFeeWei: bigint;
  perItemGasWei: bigint;
  expiresAt: number;
}
const pendingBatchConfirmations = new Map<string, BatchConfirmationRequest>();

// Periodic GC for expired batch confirmations
setInterval(() => {
  const now = Date.now();
  for (const [id, req] of pendingBatchConfirmations) {
    if (now > req.expiresAt) pendingBatchConfirmations.delete(id);
  }
}, 60_000).unref();

export function registerBatchTools(server: McpServer): string[] {
  const registered: string[] = [];
  const config = getConfig();
  const rxmClient = getRxmClient();

  // @ts-expect-error — TS2589: Known MCP SDK issue with deep Zod schema inference
  server.tool(
    "rxm_prepare_batch",
    "Phase 1 of 2 (Batch): Prepares multiple records for registration. Deduplicates, estimates costs, and returns a batch_confirmation_id.",
    {
      items: z.array(z.object({
        content: z.string().optional(),
        content_hash: z.string().optional(),
        model_id: z.string(),
        tags: z.array(z.string()).optional(),
        content_type: z.string().optional(),
        human_intervention: z.enum(['none', 'prompt_only', 'supervised', 'collaborative', 'unknown']).optional(),
      })).min(1).max(100).describe("Array of items to register"),
    },
    async ({ items }) => {
      try {
        if (items.length > config.MCP_MAX_BATCH_SIZE) {
          throw new Error(`Batch size ${items.length} exceeds MCP_MAX_BATCH_SIZE (${config.MCP_MAX_BATCH_SIZE})`);
        }

        const perItemFeeWei = BigInt(config.MCP_MAX_RXM_FEE_WEI);
        const perItemGasWei = BigInt(100000) * BigInt(2000000000);

        // Compute hashes and deduplicate
        const newItems: { contentHash: string; args: any }[] = [];
        const duplicateHashes: string[] = [];

        for (const item of items) {
          if (!item.content && !item.content_hash) {
            throw new Error("Each item must provide 'content' or 'content_hash'");
          }
          let hash = item.content_hash;
          if (!hash && item.content) {
            hash = await computeContentHash(item.content);
          }

          // Dedup check (mandatory per CTO)
          if (config.MCP_BATCH_DEDUP_BEFORE_PAY) {
            const verify = await rxmClient.verify(hash as string);
            if (verify.exists) {
              duplicateHashes.push(hash as string);
              continue;
            }
          }
          newItems.push({ contentHash: hash as string, args: item });
        }

        if (newItems.length === 0) {
          return {
            content: [{ type: "text", text: JSON.stringify({
              ok: true, message: "All items already exist on-chain.",
              total: items.length, new: 0, duplicates: duplicateHashes.length,
            }, null, 2) }]
          };
        }

        // Check guardrails for new items
        const guardrails = ledger.checkBatchGuardrails(newItems.length, perItemFeeWei, perItemGasWei);
        if (!guardrails.allowed) {
          ledger.recordFailedAttempt(randomUUID(), `Batch guardrail: ${guardrails.reason}`);
          throw new Error(`Batch guardrail blocked: ${guardrails.reason}`);
        }

        const batchId = randomUUID();
        const estimatedCost = (perItemFeeWei + perItemGasWei) * BigInt(newItems.length);

        pendingBatchConfirmations.set(batchId, {
          batchId, newItems, duplicateHashes,
          perItemFeeWei, perItemGasWei,
          expiresAt: Date.now() + 10 * 60 * 1000, // 10 min for batches
        });

        return {
          content: [{ type: "text", text: JSON.stringify({
            ok: true,
            batch_confirmation_id: batchId,
            total_items: items.length,
            new_items: newItems.length,
            duplicate_items: duplicateHashes.length,
            estimated_total_cost_wei: estimatedCost.toString(),
            per_item_fee_wei: perItemFeeWei.toString(),
            per_item_gas_wei: perItemGasWei.toString(),
            message: "Batch prepared. Review costs above, then use rxm_confirm_batch to finalize.",
          }, null, 2) }]
        };

      } catch (error: any) {
        return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
      }
    }
  );
  registered.push('rxm_prepare_batch');

  server.tool(
    "rxm_confirm_batch",
    "Phase 2 of 2 (Batch): Confirms a previously prepared batch using its batch_confirmation_id.",
    {
      batch_confirmation_id: z.string().describe("The ID returned by rxm_prepare_batch"),
    },
    async ({ batch_confirmation_id }) => {
      try {
        const req = pendingBatchConfirmations.get(batch_confirmation_id);
        if (!req) throw new Error("Invalid or expired batch_confirmation_id");
        if (Date.now() > req.expiresAt) {
          pendingBatchConfirmations.delete(batch_confirmation_id);
          throw new Error("Batch confirmation request expired");
        }
        pendingBatchConfirmations.delete(batch_confirmation_id);

        // Re-check guardrails
        const guardrails = ledger.checkBatchGuardrails(req.newItems.length, req.perItemFeeWei, req.perItemGasWei);
        if (!guardrails.allowed) {
          ledger.recordFailedAttempt(batch_confirmation_id, `Batch confirm guardrail: ${guardrails.reason}`);
          throw new Error(`Batch guardrail blocked on confirm: ${guardrails.reason}`);
        }

        const estimatedCost = (req.perItemFeeWei + req.perItemGasWei) * BigInt(req.newItems.length);
        ledger.createBatchJob(req.batchId, req.newItems.length + req.duplicateHashes.length, req.newItems.length, req.duplicateHashes.length, estimatedCost);
        ledger.updateBatchJobStatus(req.batchId, 'processing');

        // Record duplicates in ledger
        for (const dupHash of req.duplicateHashes) {
          ledger.addBatchItem({ batchId: req.batchId, contentHash: dupHash, recordId: null, feeTxHash: null, status: 'duplicate', errorCode: null });
        }

        // Process new items
        const results: { contentHash: string; recordId?: string; status: string; error?: string }[] = [];
        let actualCost = 0n;

        for (const item of req.newItems) {
          try {
            const tags = [...(item.args.tags || []), ...config.MCP_DEFAULT_TAGS];
            const record = await rxmClient.recordHash(item.contentHash, {
              modelId: item.args.model_id,
              tags,
              contentType: item.args.content_type,
              paymentMode: config.MCP_PAYMENT_MODE as "legacy" | "x402"
            });

            ledger.recordTransaction(record.recordId, "0x_rxm_sdk_batch", req.perItemFeeWei, req.perItemGasWei);
            ledger.addBatchItem({ batchId: req.batchId, contentHash: item.contentHash, recordId: record.recordId, feeTxHash: "0x_rxm_sdk_batch", status: 'success', errorCode: null });
            actualCost += req.perItemFeeWei + req.perItemGasWei;
            results.push({ contentHash: item.contentHash, recordId: record.recordId, status: 'success' });
          } catch (itemError: any) {
            ledger.addBatchItem({ batchId: req.batchId, contentHash: item.contentHash, recordId: null, feeTxHash: null, status: 'failed', errorCode: itemError.message });
            results.push({ contentHash: item.contentHash, status: 'failed', error: itemError.message });
          }
        }

        const successCount = results.filter(r => r.status === 'success').length;
        const failedCount = results.filter(r => r.status === 'failed').length;
        const finalStatus = failedCount === 0 ? 'completed' : (successCount === 0 ? 'failed' : 'completed');
        ledger.updateBatchJobStatus(req.batchId, finalStatus, actualCost);

        return {
          content: [{ type: "text", text: JSON.stringify({
            ok: true,
            batch_id: req.batchId,
            summary: { total: req.newItems.length + req.duplicateHashes.length, success: successCount, failed: failedCount, duplicates: req.duplicateHashes.length },
            actual_cost_wei: actualCost.toString(),
            results,
            message: `Batch ${finalStatus}. ${successCount} created, ${failedCount} failed, ${req.duplicateHashes.length} duplicates skipped.`,
          }, null, 2) }]
        };

      } catch (error: any) {
        return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
      }
    }
  );
  registered.push('rxm_confirm_batch');

  return registered;
}
