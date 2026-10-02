// SPDX-License-Identifier: Apache-2.0
import type { DbDeclaration } from '../db/schema.js';

/**
 * Self-contained receipt: everything @res-ex-machina/pog `verifyFromChain` needs, so the
 * holder can verify without this service.
 */
export function toReceipt(row: DbDeclaration) {
    const anchored = row.state === 'anchored' && row.anchorTxHash != null && row.anchorLogIndex != null;
    return {
        profile: 'rxm-pog-v2',
        id: row.id,
        digest: row.digest,
        state: row.state,
        declaration: row.declaration,
        signature: row.signature,
        metadata: row.metadata ?? undefined,
        domain: { name: 'ResExMachina PoG', version: '2', chainId: row.chainId, verifyingContract: row.contract },
        anchor: anchored ? {
            chainId: row.chainId,
            contract: row.contract,
            transactionHash: row.anchorTxHash,
            logIndex: row.anchorLogIndex,
            blockNumber: row.anchorBlock?.toString(),
            blockTime: row.anchorBlockTime?.toISOString(),
            agentIdScheme: row.agentIdScheme,
            agentId: row.agentId,
        } : null,
        statement: anchored
            ? `The key ${(row.declaration as { agent: string }).agent} signed this declaration, and it existed no later than block ${row.anchorBlock} on chain ${row.chainId}. Model, runtime, process and declared time are the signer's claims, not verified facts.`
            : undefined,
        verify: 'Verify without this service: @res-ex-machina/pog verifyFromChain(client, { transactionHash, logIndex }, { declaration, signature, domain })',
    };
}
