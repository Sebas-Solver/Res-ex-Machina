import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { RxMClient, rxmProtocolConfig, RxMContentStatus } from '@res-ex-machina/sdk';
import { createWalletClient, http, publicActions } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { getConfig, setConfirmationMode } from './config';
import { Ledger } from './ledger';

const config = getConfig();
const ledger = new Ledger();

let viemClient: any = null;
let viemAccount: any = null;
let rxmClient: RxMClient | null = null;

if (config.MCP_PRIVATE_KEY && config.MCP_ENABLE_WRITE_TOOLS) {
  viemAccount = privateKeyToAccount(config.MCP_PRIVATE_KEY as `0x${string}`);
  const transport = http(config.MCP_RPC_URL);
  const chain = baseSepolia;
  
  viemClient = createWalletClient({
    account: viemAccount,
    chain,
    transport
  }).extend(publicActions);

  rxmClient = new RxMClient({
    walletClient: viemClient,
    environment: config.MCP_ALLOW_MAINNET ? 'production' : 'sandbox',
    apiUrl: config.MCP_API_URL
  });
} else {
  const transport = http(config.MCP_RPC_URL);
  const chain = baseSepolia;
  
  viemClient = createWalletClient({
    chain,
    transport
  }).extend(publicActions);

  rxmClient = new RxMClient({
    walletClient: viemClient,
    environment: config.MCP_ALLOW_MAINNET ? 'production' : 'sandbox',
    apiUrl: config.MCP_API_URL
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
        const hash = await RxMClient.hashContent(content);
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
        const hash = await RxMClient.hashContent(content);
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
      if (!viemAccount) {
         return { content: [{ type: "text", text: "Wallet not configured in this MCP server. Read-only mode active." }] };
      }
      try {
        const balance = await viemClient.getBalance({ address: viemAccount.address });
        const { recordsCount } = ledger.getDailyStats();
        const recordsRemaining = Math.max(0, config.MCP_MAX_RECORDS_PER_DAY - recordsCount);
        const canRegister = balance > BigInt(config.MCP_MAX_TOTAL_TX_COST_WEI) && recordsRemaining > 0;
        
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify({ 
              wallet_address: viemAccount.address, 
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
       try {
          const res = await fetch(`${config.MCP_API_URL}/records/${record_id}`);
          if (!res.ok) throw new Error(`Failed to fetch record: ${res.statusText}`);
          const data = await res.json();
          return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
       } catch (error: any) {
          return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
       }
    }
  );

  if (config.MCP_ENABLE_WRITE_TOOLS && rxmClient) {
    server.tool(
      "rxm_record_generation",
      "Registers an AI generation on-chain via Res-ex-Machina. Incurs an ETH fee. Protected by strict guardrails.",
      {
        content: z.string().optional().describe("The generated content to record"),
        content_hash: z.string().optional().describe("The pre-calculated SHA-256 hash"),
        model_id: z.string().describe("The ID of the AI model used"),
        tags: z.array(z.string()).optional().describe("Optional tags for categorization"),
        content_type: z.string().optional().describe("MIME type of the content (default: text/plain)"),
        human_intervention: z.string().optional().describe("Description of human edits. Required if MCP_CONFIRMATION_MODE=require."),
        dry_run: z.boolean().optional().describe("If true, performs validation but does not send the transaction")
      },
      async (args) => {
        try {
          if (!args.content && !args.content_hash) {
            throw new Error("Must provide either 'content' or 'content_hash'");
          }
          if (config.MCP_REQUIRE_MODEL_ID && !args.model_id) {
            throw new Error("model_id is required by server configuration");
          }
          if (args.content && Buffer.byteLength(args.content, 'utf8') > config.MCP_MAX_CONTENT_BYTES) {
            throw new Error(`Content exceeds maximum allowed size of ${config.MCP_MAX_CONTENT_BYTES} bytes`);
          }
          const cType = args.content_type || 'text/plain';
          if (!config.MCP_ALLOWED_CONTENT_TYPES.includes(cType)) {
             throw new Error(`Content type ${cType} is not allowed. Allowed types: ${config.MCP_ALLOWED_CONTENT_TYPES.join(',')}`);
          }

          if (config.MCP_CONFIRMATION_MODE === 'require' && !args.human_intervention) {
             throw new Error("Server requires human confirmation. Please prompt the user for review and include 'human_intervention' string in your arguments, explaining the user's explicit consent.");
          }

          let targetHash = args.content_hash;
          if (!targetHash && args.content) {
            targetHash = await RxMClient.hashContent(args.content);
          }

          const feeWei = BigInt(rxmProtocolConfig.FEE_AMOUNT_WEI.toString());
          const gasCostWei = BigInt(100000) * BigInt(2000000000);
          
          const guardrails = ledger.checkGuardrails(feeWei, gasCostWei);
          if (!guardrails.allowed) {
            throw new Error(`Guardrail blocked transaction: ${guardrails.reason}`);
          }

          if (args.dry_run || config.MCP_CONFIRMATION_MODE === 'dry-run') {
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
          
          const record = await rxmClient!.record({
            contentHash: targetHash as string,
            metadata: {
               model: args.model_id,
               tags: tags,
               humanIntervention: args.human_intervention
            }
          });

          ledger.recordTransaction(
             record.id,
             "0x_rxm_sdk_internal",
             feeWei,
             gasCostWei
          );

          return {
            content: [{ 
              type: "text", 
              text: JSON.stringify({
                ok: true,
                record_id: record.id,
                content_hash: record.contentHash,
                receipt_hash: record.receiptHash,
                state: record.status,
                verification_url: `https://sepolia.basescan.org/tx/${record.anchorTxHash || ''}`,
                message: "Record created successfully."
              }, null, 2) 
            }]
          };

        } catch (error: any) {
          return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
        }
      }
    );
  }
}
