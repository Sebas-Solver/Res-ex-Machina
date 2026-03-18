# How to verify a PoG offline

This document explains how to verify that a Proof of Generation (PoG) is authentic **without relying on the Res ex Machina server**.

---

## 1. Get the receipt

```bash
curl https://api.resexmachina.io/v1/records/{record_id}/export > receipt.json
```

You will get a JSON like this:

```json
{
  "schema": "rex.receipt.v1",
  "record_id": "01936d8a-1234-7000-8000-000000000001",
  "content_hash": "sha256:a1b2c3d4e5f6...",
  "pog_bundle": {
    "schema": "pog.v1",
    "content_hash": "sha256:a1b2c3d4e5f6...",
    "agent_wallet": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    "model_id": "openai:gpt-4o:2026-01",
    "runtime_id": "node-22.x",
    "generation_process": {
      "process_type": "direct",
      "human_intervention_level": 0,
      "pipeline_steps": 1
    },
    "timestamp": "2026-01-15T10:30:00.000Z",
    "nonce": "abc123def456ghi789",
    "signature": "0x..."
  },
  "receipt_hash": "sha256:...",
  "anchor": {
    "tx_hash": "0x...",
    "block": 58123456,
    "chain_id": 137,
    "anchored_at": "2026-01-15T10:31:22.000Z"
  }
}
```

---

## 2. Verify the EIP-712 Signature

The signature proves that the declared `agent_wallet` actually signed this PoG.

### With viem (JavaScript/TypeScript)

```typescript
import { verifyTypedData } from 'viem';

const domain = {
  name: 'ResExMachina',
  version: '1',
  chainId: 0,
  verifyingContract: '0x0000000000000000000000000000000000000000',
};

const types = {
  PoGBundle: [
    { name: 'schema', type: 'string' },
    { name: 'content_hash', type: 'string' },
    { name: 'agent_wallet', type: 'address' },
    { name: 'model_id', type: 'string' },
    { name: 'runtime_id', type: 'string' },
    { name: 'process_type', type: 'string' },
    { name: 'human_intervention_level', type: 'uint8' },
    { name: 'pipeline_steps', type: 'uint16' },
    { name: 'timestamp', type: 'string' },
    { name: 'nonce', type: 'string' },
  ],
};

const pog = receipt.pog_bundle;
const message = {
  schema: pog.schema,
  content_hash: pog.content_hash,
  agent_wallet: pog.agent_wallet,
  model_id: pog.model_id,
  runtime_id: pog.runtime_id,
  process_type: pog.generation_process.process_type,
  human_intervention_level: pog.generation_process.human_intervention_level,
  pipeline_steps: pog.generation_process.pipeline_steps,
  timestamp: pog.timestamp,
  nonce: pog.nonce,
};

const isValid = await verifyTypedData({
  address: pog.agent_wallet,
  domain,
  types,
  primaryType: 'PoGBundle',
  message,
  signature: pog.signature,
});

console.log('Valid signature:', isValid); // true
```

### With ethers.js

```typescript
import { ethers } from 'ethers';

const recoveredAddress = ethers.verifyTypedData(domain, types, message, pog.signature);
const isValid = recoveredAddress.toLowerCase() === pog.agent_wallet.toLowerCase();
console.log('Valid signature:', isValid);
```

---

## 3. Verify the receipt_hash

The `receipt_hash` deterministically links all record data.

```typescript
import { createHash } from 'crypto';

const canonical = [
  receipt.record_id,
  receipt.content_hash,
  receipt.pog_bundle.agent_wallet.toLowerCase(),
  receipt.pog_bundle.nonce,
  receipt.created_at,
].join('|');

const hash = createHash('sha256').update(canonical).digest('hex');
const expected = `sha256:${hash}`;

console.log('Valid receipt hash:', expected === receipt.receipt_hash); // true
```

---

## 4. Verify the on-chain anchor

If the record is anchored (`state: anchored`), you can verify that the `receipt_hash` was written to the blockchain.

### With an explorer

1. Go to [Polygonscan](https://polygonscan.com/tx/{anchor.tx_hash})
2. In "Input Data", decode and verify it contains the `receipt_hash`

### With viem (programmatic)

```typescript
import { createPublicClient, http } from 'viem';
import { polygon } from 'viem/chains';

const client = createPublicClient({
  chain: polygon,
  transport: http('https://polygon-rpc.com'),
});

const tx = await client.getTransaction({ hash: receipt.anchor.tx_hash });
// Input data contains the receipt_hash
console.log('Anchor tx found in block:', tx.blockNumber);
```

---

## 5. Verify your content against the hash

If you have the original content, calculate its SHA-256 and compare:

```bash
# Linux/Mac
sha256sum my_file.txt
# Output: a1b2c3d4e5f6... my_file.txt

# Compare with receipt.content_hash (without "sha256:" prefix)
```

```typescript
import { createHash } from 'crypto';
import fs from 'fs';

const content = fs.readFileSync('my_file.txt');
const hash = `sha256:${createHash('sha256').update(content).digest('hex')}`;
console.log('Content hash match:', hash === receipt.content_hash);
```

---

## Verification Summary

| Check | What it proves | Tool |
|---|---|---|
| EIP-712 Signature | The agent_wallet signed this PoG | viem / ethers.js |
| Receipt hash | The data was not altered | SHA-256 |
| On-chain Anchor | The record existed on that date | Polygonscan / viem |
| Content hash | Your content matches what is registered | sha256sum |
