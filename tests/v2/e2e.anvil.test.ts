// SPDX-License-Identifier: Apache-2.0
/**
 * Full v2 pipeline on a local chain: accept → anchor (real viem clients, real RxMAnchor) →
 * receipt → verifyFromChain with nothing but the receipt and an RPC.
 * Runs only with RXM_E2E_RPC (Anvil) and RXM_E2E_ARTIFACT (forge build output).
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createPublicClient, createWalletClient, http, type Hex } from 'viem';
import { foundry } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { verifyFromChain, erc8263, type PoGDeclaration } from '@res-ex-machina/pog';
import { acceptDeclaration } from '../../src/v2/accept.js';
import { anchorDeclaration, type AnchorDeps } from '../../src/v2/anchor.js';
import { getById } from '../../src/v2/store.js';
import { toReceipt } from '../../src/v2/receipt.js';
import { createTestDb, signed } from './helpers.js';
import { pogDomain, signDeclaration } from '@res-ex-machina/pog';

vi.mock('../../src/config/monitoring.js', () => ({ Sentry: { captureException: vi.fn() }, initMonitoring: vi.fn() }));

const RPC = process.env.RXM_E2E_RPC;
const ARTIFACT = process.env.RXM_E2E_ARTIFACT;
const RELAYER_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'; // public Anvil #1

describe.skipIf(!RPC || !ARTIFACT)('v2 pipeline on Anvil', () => {
    it('accepts, anchors and produces a receipt verifiable from chain alone', async () => {
        const t = await createTestDb();
        const relayer = privateKeyToAccount(RELAYER_KEY);
        const publicClient = createPublicClient({ chain: foundry, transport: http(RPC) });
        const walletClient = createWalletClient({ chain: foundry, transport: http(RPC), account: relayer });
        const artifact = JSON.parse(readFileSync(ARTIFACT!, 'utf8'));
        const deploy = await walletClient.deployContract({ abi: erc8263.ERC8263_ABI, bytecode: artifact.bytecode.object as Hex });
        const contract = (await publicClient.waitForTransactionReceipt({ hash: deploy })).contractAddress!;
        const config = { enabled: true, chainId: foundry.id, contract, agentDailyQuota: 10, globalDailyQuota: 10 };

        // Sign for this chain and contract.
        const base = await signed();
        const domain = pogDomain(foundry.id, contract);
        const signature = await signDeclaration(base.account, domain, base.declaration);
        const body = { ...base.body, signature };

        const { status, row } = await acceptDeclaration(config, { db: t.db, enqueue: async () => {} }, body);
        expect(status).toBe(202);
        const out = await anchorDeclaration({ db: t.db, publicClient, walletClient } as unknown as AnchorDeps, row.id);
        expect(out.status).toBe('anchored');

        const receipt = toReceipt((await getById(t.db, row.id))!);
        expect(receipt.anchor).not.toBeNull();
        expect(receipt.statement).toContain('existed no later than block');

        // A third party with only the receipt JSON and an RPC:
        const json = JSON.parse(JSON.stringify(receipt));
        const declaration: PoGDeclaration = { ...json.declaration, declaredAt: BigInt(json.declaration.declaredAt) };
        const result = await verifyFromChain(publicClient,
            { transactionHash: json.anchor.transactionHash, logIndex: json.anchor.logIndex },
            { declaration, signature: json.signature, domain: json.domain });
        expect(result.valid).toBe(true);
        await t.close();
    }, 60_000);
});
