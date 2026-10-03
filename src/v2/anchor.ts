// SPDX-License-Identifier: Apache-2.0
/**
 * Anchor one declaration through RxMAnchor.anchorWithAux.
 *
 * Safety properties (each covered by tests):
 * - lease-based claim: two workers never anchor the same row at once; a crashed worker's lease expires;
 * - the tx hash is stored as soon as it is sent, so a retry checks that tx instead of sending another;
 * - a row only becomes `anchored` after the AnchorProof log with its digest is found in a successful receipt.
 */
import type { Account, Chain, Hex, PublicClient, Transport, WalletClient } from 'viem';
import { erc8263 } from '@res-ex-machina/pog';
import { claimForAnchoring, recordSentTx, markAnchored, markAttemptFailed, releaseClaim, type Db } from './store.js';

export interface AnchorDeps {
    db: Db;
    publicClient: PublicClient;
    walletClient: WalletClient<Transport, Chain, Account>;
    maxAttempts?: number;
    leaseSeconds?: number;
    receiptTimeoutMs?: number;
    /** Pause anchoring (without spending attempts) while the relayer holds less than this. Threat model V2-2. */
    minRelayerBalanceWei?: bigint;
}

export type AnchorOutcome =
    | { status: 'anchored'; txHash: Hex; logIndex: number; block: bigint }
    | { status: 'skipped' }
    | { status: 'paused'; reason: string }
    | { status: 'retry' | 'failed'; error: string };

async function findAnchorLog(deps: AnchorDeps, txHash: Hex, contract: string, digest: string) {
    const receipt = await deps.publicClient.waitForTransactionReceipt({ hash: txHash, timeout: deps.receiptTimeoutMs ?? 120_000 });
    if (receipt.status !== 'success') return { reverted: true as const };
    const log = receipt.logs.find((l) =>
        l.address.toLowerCase() === contract.toLowerCase()
        && l.topics[0]?.toLowerCase() === erc8263.ERC8263_TOPIC0.toLowerCase()
        && l.topics[2]?.toLowerCase() === digest.toLowerCase());
    if (!log || log.logIndex == null) throw new Error(`tx ${txHash} succeeded without an AnchorProof log for this digest`);
    const block = await deps.publicClient.getBlock({ blockNumber: receipt.blockNumber });
    return { reverted: false as const, logIndex: log.logIndex, block: receipt.blockNumber, blockTime: new Date(Number(block.timestamp) * 1000) };
}

export async function anchorDeclaration(deps: AnchorDeps, id: string): Promise<AnchorOutcome> {
    const row = await claimForAnchoring(deps.db, id, deps.leaseSeconds ?? 300);
    if (!row) return { status: 'skipped' };
    const maxAttempts = deps.maxAttempts ?? 5;

    try {
        // A previous attempt may have sent the tx and died before recording the result.
        if (row.anchorTxHash) {
            const prev = await findAnchorLog(deps, row.anchorTxHash as Hex, row.contract, row.digest).catch(() => null);
            if (prev && !prev.reverted) {
                await markAnchored(deps.db, id, { txHash: row.anchorTxHash, ...prev });
                return { status: 'anchored', txHash: row.anchorTxHash as Hex, logIndex: prev.logIndex, block: prev.block };
            }
        }

        if (deps.minRelayerBalanceWei !== undefined && deps.minRelayerBalanceWei > 0n) {
            const balance = await deps.publicClient.getBalance({ address: deps.walletClient.account.address });
            if (balance < deps.minRelayerBalanceWei) {
                const reason = `relayer_low_balance: ${balance} wei < ${deps.minRelayerBalanceWei} wei`;
                await releaseClaim(deps.db, id, reason);
                return { status: 'paused', reason };
            }
        }

        const txHash = await deps.walletClient.writeContract({
            address: row.contract as Hex,
            abi: erc8263.ERC8263_ABI,
            functionName: 'anchorWithAux',
            args: [row.agentIdScheme, row.agentId as Hex, row.digest as Hex, erc8263.encodeSingleAux(row.signature as Hex)],
        });
        await recordSentTx(deps.db, id, txHash);

        const res = await findAnchorLog(deps, txHash, row.contract, row.digest);
        if (res.reverted) throw new Error(`anchor tx ${txHash} reverted`);
        await markAnchored(deps.db, id, { txHash, ...res });
        return { status: 'anchored', txHash, logIndex: res.logIndex, block: res.block };
    } catch (e) {
        const msg = (e as Error).message ?? String(e);
        const state = await markAttemptFailed(deps.db, id, msg, maxAttempts);
        return { status: state === 'failed' ? 'failed' : 'retry', error: msg };
    }
}
