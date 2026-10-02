// SPDX-License-Identifier: Apache-2.0
/**
 * rxm-verify CLI against a real local chain: deploy RxMAnchor, anchor a signed declaration through a
 * relayer, write the receipt to a file, then verify it with the built CLI only.
 * Runs when RXM_E2E_RPC (Anvil) and RXM_E2E_ARTIFACT (forge build output) are set; needs `npm run build`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, createWalletClient, http, keccak256, toBytes, type Hex } from 'viem';
import { foundry } from 'viem/chains';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { pogDomain, signDeclaration, declarationDigest, sha256, agentIdForKey, erc8263, ZERO_HASH } from '../src/index.js';

const RPC = process.env.RXM_E2E_RPC;
const ARTIFACT = process.env.RXM_E2E_ARTIFACT;
const RELAYER_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'; // public Anvil #1

describe.skipIf(!RPC || !ARTIFACT)('rxm-verify on Anvil', () => {
    it('exit 0 for a genuine receipt, 1 for a tampered one, 1 for the wrong content', async () => {
        const pub = createPublicClient({ chain: foundry, transport: http(RPC) });
        const wallet = createWalletClient({ chain: foundry, transport: http(RPC), account: privateKeyToAccount(RELAYER_KEY) });
        const art = JSON.parse(readFileSync(ARTIFACT!, 'utf8'));
        const contract = (await pub.waitForTransactionReceipt({ hash: await wallet.deployContract({ abi: erc8263.ERC8263_ABI, bytecode: art.bytecode.object as Hex }) })).contractAddress!;

        const agent = privateKeyToAccount(generatePrivateKey());
        const content = 'cli e2e content';
        const domain = pogDomain(foundry.id, contract);
        const declaration = {
            agent: agent.address, contentHash: sha256(content), inputHash: ZERO_HASH, modelId: 'example:model', runtimeId: 'cli/1',
            processType: 0, humanIntervention: 0, pipelineSteps: 1, declaredAt: BigInt(Math.floor(Date.now() / 1000)),
            nonce: keccak256(toBytes(generatePrivateKey())), metadataHash: ZERO_HASH,
        };
        const signature = await signDeclaration(agent, domain, declaration);
        const tx = await wallet.writeContract({ address: contract, abi: erc8263.ERC8263_ABI, functionName: 'anchorWithAux',
            args: [2, agentIdForKey(foundry.id, agent.address), declarationDigest(domain, declaration), erc8263.encodeSingleAux(signature)] });
        const logIndex = (await pub.waitForTransactionReceipt({ hash: tx })).logs[0].logIndex;

        const dir = mkdtempSync(join(tmpdir(), 'rxm-'));
        const rec = { profile: 'rxm-pog-v2', state: 'anchored', signature, domain,
            declaration: { ...declaration, declaredAt: declaration.declaredAt.toString() }, anchor: { transactionHash: tx, logIndex } };
        writeFileSync(join(dir, 'r.json'), JSON.stringify(rec));
        writeFileSync(join(dir, 'lie.json'), JSON.stringify({ ...rec, declaration: { ...rec.declaration, modelId: 'other:model' } }));
        writeFileSync(join(dir, 'c.txt'), content);
        writeFileSync(join(dir, 'edited.txt'), content + '!');

        const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
        const run = (...a: string[]) => spawnSync('node', [cli, ...a, '--rpc', RPC!], { encoding: 'utf8' });
        const ok = run(join(dir, 'r.json'), '--content', join(dir, 'c.txt'));
        expect(ok.status).toBe(0);
        expect(ok.stdout).toMatch(/\nVALID/);
        expect(run(join(dir, 'lie.json')).status).toBe(1);
        expect(run(join(dir, 'r.json'), '--content', join(dir, 'edited.txt')).status).toBe(1);
        expect(run(join(dir, 'missing.json')).status).toBe(2);
    }, 60_000);
});
