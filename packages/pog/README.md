# @res-ex-machina/pog

Build, sign and verify **rxm-pog-v2** generation declarations ([spec](../../spec/rxm-pog-v2.md)).

A declaration is an EIP-712 message in which an agent's key states that some content (by SHA-256) was generated with a declared model and process. Once anchored, anyone can verify it **from chain state alone**: no Res ex Machina service is involved.

```ts
import { privateKeyToAccount } from 'viem/accounts';
import { pogDomain, signDeclaration, sha256, metadataHash, erc8263, agentIdForKey, verifyFromChain } from '@res-ex-machina/pog';

const domain = pogDomain(84532, ANCHOR_CONTRACT);           // chain + anchoring contract
const declaration = {
  agent: account.address,
  contentHash: sha256(contentBytes),
  inputHash: sha256(promptBytes),
  modelId: 'provider:model', runtimeId: 'my-agent/1.0',
  processType: 0, humanIntervention: 1, pipelineSteps: 1,
  declaredAt: BigInt(Math.floor(Date.now() / 1000)),
  nonce: randomBytes32, metadataHash: metadataHash({ tags: ['demo'] }),
};
const signature = await signDeclaration(account, domain, declaration);
// Anchor: anchorWithAux(2, agentIdForKey(84532, account.address), declarationDigest(domain, declaration), erc8263.encodeSingleAux(signature))

const result = await verifyFromChain(publicClient, { transactionHash, logIndex }, { declaration, signature, domain, content: contentBytes });
result.valid;      // all mandatory checks passed
result.statement;  // the only claim a valid result supports
```

## Command line: `rxm-verify`

```bash
npx -p @res-ex-machina/pog rxm-verify receipt.json --content output.txt
rxm-verify https://<api>/v2/declarations/0x… --rpc https://sepolia.base.org --json
```

It reads a receipt (file or URL), ignores the receipt's own `state`, `anchor` claims and `statement`, re-derives everything from the chain, and prints each check. Exit code: `0` valid, `1` not valid, `2` usage or I/O error. Default RPCs: Base (8453), Base Sepolia (84532), local Anvil (31337).

## Using the hosted API

```ts
import { RxMClient } from '@res-ex-machina/pog';

const rxm = new RxMClient({ apiUrl, chainId: 84532, contract: ANCHOR_CONTRACT });
const pending = await rxm.declare(account, { content: output, input: prompt, modelId: 'provider:model', runtimeId: 'my-agent/1.0' });
const receipt = await rxm.waitForAnchor(pending.digest);
// Then verify it yourself: verifyReceipt(receipt, { content: output })
```

The API pays the gas (no fee) within per-agent quotas. Keep the receipt: with it and any node, anyone can verify the declaration even if the API disappears.

## What a valid result means

The key signed the declaration and the declaration existed no later than the anchor block. Model, runtime, process and declared time are **the signer's claims**, not verified facts.

## Anchoring bindings

The declaration format does not depend on any one anchoring standard. Today the only binding is `erc8263` (draft ERC-8263 `AnchorProof` event). If that draft changes or another standard appears, a new binding is added next to it and existing anchors remain verifiable.
