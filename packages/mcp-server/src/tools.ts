import { z } from 'zod';
import { randomUUID } from 'crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { RxMClient, computeContentHash } from '@res-ex-machina/sdk';
import { createWalletClient, http, publicActions } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { getConfig, setConfirmationMode } from './config.js';
import { SqliteLedger, Ledger } from './ledger/index.js';

const config = getConfig();
const ledger: Ledger = new SqliteLedger();

// In-memory store for prepare/confirm flow
interface ConfirmationRequest {
  id: string;
  args: any;
  feeWei: bigint;
  gasCostWei: bigint;
  expiresAt: number;
}
const pendingConfirmations = new Map<string, ConfirmationRequest>();

// In-memory store for batch prepare/confirm flow
interface BatchConfirmationRequest {
  batchId: string;
  newItems: { contentHash: string; args: any }[];
  duplicateHashes: string[];
  perItemFeeWei: bigint;
  perItemGasWei: bigint;
  expiresAt: number;
}
const pendingBatchConfirmations = new Map<string, BatchConfirmationRequest>();

let viemClient: any = null;
let viemAccount: any = null;
let rxmClient: RxMClient | null = null;
let publicAddress: string | undefined = undefined;

if (config.MCP_PRIVATE_KEY) {
  viemAccount = privateKeyToAccount(config.MCP_PRIVATE_KEY as `0x${string}`);
  publicAddress = viemAccount.address;
} else if (config.MCP_WALLET_ADDRESS) {
  publicAddress = config.MCP_WALLET_ADDRESS;
}

if (config.MCP_PRIVATE_KEY && config.MCP_ENABLE_WRITE_TOOLS) {
  const transport = http(config.MCP_RPC_URL);
  const chain = baseSepolia;
  
  viemClient = createWalletClient({
    account: viemAccount,
    chain,
    transport
  }).extend(publicActions);

  rxmClient = new RxMClient({
    account: viemAccount,
    rpcUrl: config.MCP_RPC_URL,
    apiUrl: config.MCP_API_URL,
    feeReceiverAddress: (config.MCP_FEE_RECEIVER_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`
  });
} else {
  // Read-only setup (we don't need private key for verify)
  const transport = http(config.MCP_RPC_URL);
  const chain = baseSepolia;
  
  viemClient = createWalletClient({
    chain,
    transport
  }).extend(publicActions);

  // We only need the API URL to do verification
  rxmClient = new RxMClient({
    account: privateKeyToAccount('0x0000000000000000000000000000000000000000000000000000000000000001'), // Dummy account for read-only
    rpcUrl: config.MCP_RPC_URL,
    apiUrl: config.MCP_API_URL,
    feeReceiverAddress: (config.MCP_FEE_RECEIVER_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`
  });
}

export function registerTools(server: McpServer) {
  
  server.tool(
    "rxm_set_confirmation_mode",
    "Updates the confirmation mode for the MCP server. Allowed values: 'require' (human must review), 'auto' (fully automated with guardrails), 'dry-run' (simulates transactions).",
    { mode: z.enum(['require', 'auto', 'dry-run']).describe("The new confirmation mode") },
    async ({ mode }) => {
      setConfirmationMode(mode);
      return {
        content: [{
          type: "text",
          text: `Confirmation mode successfully updated to: ${mode}`
        }]
      };
    }
  );

  server.tool(
    "rxm_hash_content",
    "Calculates the SHA-256 content hash required by Res-ex-Machina without sending data on-chain.",
    { content: z.string().describe("The content to hash") },
    async ({ content }) => {
      try {
        const hash = await computeContentHash(content);
        return { content: [{ type: "text", text: JSON.stringify({ content_hash: hash }, null, 2) }] };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "rxm_verify_hash",
    "Verifies the on-chain status of a given content hash.",
    { content_hash: z.string().startsWith('sha256:').describe("The content hash to verify") },
    async ({ content_hash }) => {
      if (!rxmClient) return { content: [{ type: "text", text: "RxM Client not initialized" }], isError: true };
      try {
        const result = await rxmClient.verify(content_hash);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "rxm_verify_content",
    "Hashes the provided content and verifies its on-chain status.",
    { content: z.string().describe("The content to verify") },
    async ({ content }) => {
      if (!rxmClient) return { content: [{ type: "text", text: "RxM Client not initialized" }], isError: true };
      try {
        const hash = await computeContentHash(content);
        const result = await rxmClient.verify(hash);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "rxm_get_wallet_balance",
    "Gets the ETH balance of the agent's hot wallet and daily record allowance.",
    {},
    async () => {
      if (!publicAddress) {
         return { content: [{ type: "text", text: "Wallet not configured in this MCP server. Read-only mode active." }] };
      }
      try {
        const balance = await viemClient.getBalance({ address: publicAddress });
        const { recordsCount } = ledger.getDailyStats();
        const recordsRemaining = Math.max(0, config.MCP_MAX_RECORDS_PER_DAY - recordsCount);
        const canRegister = balance > BigInt(config.MCP_MAX_TOTAL_TX_COST_WEI) && recordsRemaining > 0;
        
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify({ 
              wallet_address: publicAddress, 
              chain_id: config.MCP_CHAIN_ID, 
              balance_eth: Number(balance) / 1e18,
              daily_records_remaining: recordsRemaining,
              can_register_estimated: canRegister
            }, null, 2) 
          }]
        };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "rxm_get_receipt",
    "Retrieves the detailed receipt of a previously created record.",
    { record_id: z.string().describe("The ID of the record to retrieve") },
    async ({ record_id }) => {
       if (!rxmClient) return { content: [{ type: "text", text: "RxM Client not initialized" }], isError: true };
       try {
          const result = await rxmClient.getRecord(record_id);
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
       } catch (error: any) {
          return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
       }
    }
  );

  if (config.MCP_ENABLE_WRITE_TOOLS && rxmClient) {
    
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
          const verify = await rxmClient!.verify(targetHash as string);
          if (verify.registered && verify.records && verify.records.length > 0) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  ok: true,
                  message: "Record already exists on-chain. Skipping registration.",
                  record: verify.records[0]
                }, null, 2)
              }]
            };
          }

          // In a real app we'd query gas prices, but we use hardcoded estimates for MVP
          const feeWei = BigInt(config.MCP_MAX_RXM_FEE_WEI); // Example: 0.01 ETH
          const gasCostWei = BigInt(100000) * BigInt(2000000000);
          
          const guardrails = ledger.checkGuardrails(feeWei, gasCostWei);
          if (!guardrails.allowed) {
            ledger.recordFailedAttempt(randomUUID(), `Guardrail blocked prepare: ${guardrails.reason}`);
            throw new Error(`Guardrail blocked transaction: ${guardrails.reason}`);
          }

          const confirmationId = randomUUID();
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

          // Use recordHash
          const record = await rxmClient!.recordHash(targetHash as string, {
            modelId: args.model_id,
            tags: tags,
            contentType: args.content_type
            // humanIntervention mapping would go here depending on the exact SDK typings
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

    server.tool(
      "rxm_record_generation",
      "Registers an AI generation on-chain. Only allowed if MCP_CONFIRMATION_MODE is 'auto' or 'dry-run'.",
      {
        content: z.string().optional().describe("The generated content to record"),
        content_hash: z.string().optional().describe("The pre-calculated SHA-256 hash"),
        model_id: z.string().describe("The ID of the AI model used"),
        tags: z.array(z.string()).optional().describe("Optional tags for categorization"),
        content_type: z.string().optional().describe("MIME type of the content (default: text/plain)")
      },
      async (args) => {
        try {
          if (config.MCP_CONFIRMATION_MODE === 'require') {
            throw new Error("MCP_CONFIRMATION_MODE is 'require'. You MUST use rxm_prepare_record_generation and rxm_confirm_record_generation tools instead.");
          }

          if (!args.content && !args.content_hash) {
            throw new Error("Must provide either 'content' or 'content_hash'");
          }
          if (config.MCP_REQUIRE_MODEL_ID && !args.model_id) {
            throw new Error("model_id is required by server configuration");
          }

          let targetHash = args.content_hash;
          if (!targetHash && args.content) {
            targetHash = await computeContentHash(args.content);
          }

          // Duplicate check
          const verify = await rxmClient!.verify(targetHash as string);
          if (verify.registered && verify.records && verify.records.length > 0) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  ok: true,
                  message: "Record already exists on-chain. Skipping registration.",
                  record: verify.records[0]
                }, null, 2)
              }]
            };
          }

          const feeWei = BigInt(config.MCP_MAX_RXM_FEE_WEI);
          const gasCostWei = BigInt(100000) * BigInt(2000000000);
          
          const guardrails = ledger.checkGuardrails(feeWei, gasCostWei);
          if (!guardrails.allowed) {
            ledger.recordFailedAttempt(randomUUID(), `Guardrail blocked direct record: ${guardrails.reason}`);
            throw new Error(`Guardrail blocked transaction: ${guardrails.reason}`);
          }

          if (config.MCP_CONFIRMATION_MODE === 'dry-run') {
             return {
               content: [{ 
                 type: "text", 
                 text: JSON.stringify({ 
                   ok: true, 
                   message: "Dry run successful. Guardrails passed.",
                   predicted_fee_wei: feeWei.toString(),
                   predicted_gas_wei: gasCostWei.toString()
                 }, null, 2) 
               }]
             };
          }

          const tags = [...(args.tags || []), ...config.MCP_DEFAULT_TAGS];
          
          const record = await rxmClient!.recordHash(targetHash as string, {
             modelId: args.model_id,
             tags: tags,
             contentType: args.content_type
          });

          ledger.recordTransaction(
             record.recordId,
             "0x_rxm_sdk_internal",
             feeWei,
             gasCostWei
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

    // ─── Batch Tools ────────────────────────────────────────────
    if (config.MCP_ENABLE_BATCH_TOOLS) {

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

              // Dedup check
              if (config.MCP_BATCH_DEDUP_BEFORE_PAY) {
                const verify = await rxmClient!.verify(hash as string);
                if (verify.registered && verify.records && verify.records.length > 0) {
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

            // Check guardrails for the new items only
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
                estimated_cost_wei: estimatedCost.toString(),
                per_item_fee_wei: perItemFeeWei.toString(),
                per_item_gas_wei: perItemGasWei.toString(),
                message: "Batch prepared. Use rxm_confirm_batch to finalize.",
              }, null, 2) }]
            };

          } catch (error: any) {
            return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
          }
        }
      );

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
                const record = await rxmClient!.recordHash(item.contentHash, {
                  modelId: item.args.model_id,
                  tags,
                  contentType: item.args.content_type,
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
    } // end batch tools
  }
}
