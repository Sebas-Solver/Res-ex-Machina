// SPDX-License-Identifier: Apache-2.0
/**
 * End-to-end on a local chain: deploy RxMAnchor, sign a declaration, anchor it through a relayer,
 * and verify it from chain state with verifyFromChain. Runs only when RXM_E2E_RPC points to an
 * Anvil node and RXM_E2E_BYTECODE to the compiled contract (see contracts/README.md).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createPublicClient, createWalletClient, http, keccak256, toBytes, type Hex } from 'viem';
import { foundry } from 'viem/chains';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import {
    pogDomain, signDeclaration, declarationDigest, sha256, metadataHash, agentIdForKey, verifyFromChain, erc8263,
    type PoGDeclaration,
} from '../src/index.js';

const RPC = process.env.RXM_E2E_RPC;
const ARTIFACT = process.env.RXM_E2E_ARTIFACT;
// Anvil default account #1 (public test key) acts as the relayer that pays gas.
const RELAYER_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';

describe.skipIf(!RPC || !ARTIFACT)('e2e on Anvil', () => {
    it('deploys, anchors via relayer and verifies from chain only', async () => {
        const artifact = JSON.parse(readFileSync(ARTIFACT!, 'utf8'));
        const relayer = privateKeyToAccount(RELAYER_KEY);
        const agent = privateKeyToAccount(generatePrivateKey()); // the agent never pays gas
        const pub = createPublicClient({ chain: foundry, transport: http(RPC) });
        const wallet = createWalletClient({ chain: foundry, transport: http(RPC), account: relayer });

        const deployHash = await wallet.deployContract({ abi: erc8263.ERC8263_ABI, bytecode: artifact.bytecode.object as Hex });
        const contract = (await pub.waitForTransactionReceipt({ hash: deployHash })).contractAddress!;

        const content = 'An output produced by the agent.';
        const domain = pogDomain(foundry.id, contract);
        const declaration: PoGDeclaration = {
            agent: agent.address, contentHash: sha256(content), inputHash: sha256('the prompt'),
            modelId: 'example:model', runtimeId: 'e2e/1', processType: 0, humanIntervention: 1, pipelineSteps: 1,
            declaredAt: BigInt(Math.floor(Date.now() / 1000)), nonce: keccak256(toBytes(generatePrivateKey())),
            metadataHash: metadataHash({ tags: ['e2e'] }),
        };
        const signature = await signDeclaration(agent, domain, declaration);

        const tx = await wallet.writeContract({
            address: contract, abi: erc8263.ERC8263_ABI, functionName: 'anchorWithAux',
            args: [2, agentIdForKey(foundry.id, agent.address), declarationDigest(domain, declaration), erc8263.encodeSingleAux(signature)],
        });
        const receipt = await pub.waitForTransactionReceipt({ hash: tx });

        const ok = await verifyFromChain(pub, { transactionHash: tx, logIndex: receipt.logs[0].logIndex }, { declaration, signature, domain, content });
        expect(ok.valid).toBe(true);
        expect(ok.anchor?.operator.toLowerCase()).toBe(relayer.address.toLowerCase());

        // Same anchor, but a verifier told a different model: rejected.
        const lie = await verifyFromChain(pub, { transactionHash: tx, logIndex: receipt.logs[0].logIndex }, { declaration: { ...declaration, modelId: 'other:model' }, signature, domain });
        expect(lie.valid).toBe(false);

        // Same declaration checked against another deployment's domain: rejected.
        const other = await verifyFromChain(pub, { transactionHash: tx, logIndex: receipt.logs[0].logIndex }, { declaration, signature, domain: pogDomain(foundry.id, '0x00000000000000000000000000000000000000ee') });
        expect(other.valid).toBe(false);
    }, 60_000);
});
