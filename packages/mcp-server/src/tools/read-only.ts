// SPDX-License-Identifier: Apache-2.0
/**
 * Read-Only Tools — Always available, zero-config required.
 *
 * These tools are registered regardless of MCP_ENABLE_WRITE_TOOLS.
 * They perform no on-chain writes, cost nothing, and expose no key material.
 *
 * Tools:
 *   - rxm_hash_content        — Offline SHA-256 hash
 *   - rxm_verify_hash         — Check on-chain status of a hash
 *   - rxm_verify_content      — Hash + verify in one step
 *   - rxm_get_record          — Retrieve an existing record
 *   - rxm_get_receipt         — Retrieve receipt of a record
 *
 * Conditional (only if wallet configured):
 *   - rxm_get_wallet_balance  — Own wallet balance only
 */

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { computeContentHash } from '@res-ex-machina/sdk';
import { getConfig } from '../config.js';
import { getRxmClient, getPublicAddress, hasWallet, getPublicClient } from '../crypto-sidecar.js';
import { SqliteLedger, type Ledger } from '../ledger/index.js';

const ledger: Ledger = new SqliteLedger();

export function registerReadOnlyTools(server: McpServer): string[] {
  const registered: string[] = [];
  const config = getConfig();
  const rxmClient = getRxmClient();

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
  registered.push('rxm_hash_content');

  server.tool(
    "rxm_verify_hash",
    "Verifies the on-chain status of a given content hash.",
    { content_hash: z.string().startsWith('sha256:').describe("The content hash to verify") },
    async ({ content_hash }) => {
      try {
        const result = await rxmClient.verify(content_hash);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
      }
    }
  );
  registered.push('rxm_verify_hash');

  server.tool(
    "rxm_verify_content",
    "Hashes the provided content and verifies its on-chain status.",
    { content: z.string().describe("The content to verify") },
    async ({ content }) => {
      try {
        const hash = await computeContentHash(content);
        const result = await rxmClient.verify(hash);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
      }
    }
  );
  registered.push('rxm_verify_content');

  server.tool(
    "rxm_get_receipt",
    "Retrieves the detailed receipt of a previously created record.",
    { record_id: z.string().describe("The ID of the record to retrieve") },
    async ({ record_id }) => {
      try {
        const result = await rxmClient.getRecord(record_id);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
      }
    }
  );
  registered.push('rxm_get_receipt');

  // ── Conditional: Wallet Balance ──
  // CTO Correction 2: Only register if a wallet is configured.
  // Only shows the agent's OWN wallet balance — no arbitrary address input.
  if (hasWallet()) {
    server.tool(
      "rxm_get_wallet_balance",
      "Gets the ETH balance of the agent's own hot wallet and daily record allowance.",
      {},
      async () => {
        const address = getPublicAddress()!;
        try {
          const publicClient = getPublicClient();
          const balance = await publicClient.getBalance({ address: address as `0x${string}` });
          const { recordsCount } = ledger.getDailyStats();
          const recordsRemaining = Math.max(0, config.MCP_MAX_RECORDS_PER_DAY - recordsCount);
          const canRegister = balance > BigInt(config.MCP_MAX_TOTAL_TX_COST_WEI) && recordsRemaining > 0;
          
          return {
            content: [{ 
              type: "text", 
              text: JSON.stringify({ 
                wallet_address: address, 
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
    registered.push('rxm_get_wallet_balance');
  }

  return registered;
}
