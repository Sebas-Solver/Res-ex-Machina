# Quick Start — Zero to First Record in 5 Minutes

> From nothing to a verified AI-generated content record on-chain.
>
> **⚠️ Alpha version** — Running on Base Sepolia testnet. Records may be reset.

## Prerequisites

- **Node.js ≥ 18**
- An L2 wallet with test ETH on **Base Sepolia** — get free test ETH from the [Optimism Superchain Faucet](https://console.optimism.io/faucet) (select "Base Sepolia")

## 1. Install

```bash
npm install @res-ex-machina/sdk viem
```

## 2. Create a Wallet

```typescript
import { privateKeyToAccount } from 'viem/accounts';

// ⚠️ Never hardcode private keys in production — use env variables
const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
console.log('Wallet:', account.address);
```

> **Don't have a wallet?** Two options:
>
> **Option A — MetaMask (easiest):** Install [MetaMask](https://metamask.io/) browser extension, create a wallet, and export the private key from Settings → Accounts → Export Private Key.
>
> **Option B — Code:**
> ```typescript
> import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
> const key = generatePrivateKey();
> const account = privateKeyToAccount(key);
> console.log('Private key:', key);      // Save this securely!
> console.log('Address:', account.address);
> ```
>
> Fund it with the [Optimism Superchain Faucet](https://console.optimism.io/faucet) — select "Base Sepolia" to get free test ETH.

## 3. Record an AI Output

```typescript
import { RxMClient } from '@res-ex-machina/sdk';
import { privateKeyToAccount } from 'viem/accounts';

const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);

const rxm = new RxMClient({
  account,
  rpcUrl: 'https://sepolia.base.org',
  apiUrl: 'https://res-ex-machina-api.onrender.com',
  feeReceiverAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
});

const receipt = await rxm.record('AI-generated report about climate trends in 2026', {
  modelId: 'openai:gpt-4o:2026-01',
});

console.log('✅ Registered!');
console.log('Record ID:', receipt.recordId);
console.log('Receipt hash:', receipt.receiptHash);
```

**What happens under the hood** (the SDK handles everything):
1. Hashes the content (SHA-256)
2. Signs the Proof of Generation bundle (EIP-712)
3. Pays the on-chain fee (0.01 ETH on Base Sepolia)
4. Posts to the RxM API
5. Returns a verifiable receipt

## 4. Verify

```typescript
const exists = await rxm.verify('AI-generated report about climate trends in 2026');
console.log('Verified:', exists);
// → { exists: true, recordId: '...', contentHash: 'sha256:...' }
```

Or verify via API (no SDK needed):

```bash
curl "https://res-ex-machina-api.onrender.com/v1/records/verify?content_hash=sha256:YOUR_HASH"
```

## 5. Retrieve the Full Record

```typescript
const record = await rxm.getRecord(receipt.recordId);
console.log(record);
// → { id, contentHash, walletAddress, modelId, state, pogBundle, anchoring, ... }
```

---

## Complete Working Example

Save as `register.ts` and run with `npx tsx register.ts`:

```typescript
import { RxMClient } from '@res-ex-machina/sdk';
import { privateKeyToAccount } from 'viem/accounts';

const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);

const rxm = new RxMClient({
  account,
  rpcUrl: 'https://sepolia.base.org',
  apiUrl: 'https://res-ex-machina-api.onrender.com',
  feeReceiverAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
});

async function main() {
  // 1. Register
  const receipt = await rxm.record('Hello from my AI agent!', {
    modelId: 'openai:gpt-4o:2026-01',
    contentType: 'text/plain',
  });
  console.log('✅ Record ID:', receipt.recordId);

  // 2. Verify
  const result = await rxm.verify('Hello from my AI agent!');
  console.log('🔍 Verified:', result.exists);

  // 3. Export full receipt
  const exported = await rxm.export(receipt.recordId);
  console.log('📦 Exported:', JSON.stringify(exported, null, 2));
}

main().catch(console.error);
```

```bash
# Run it
PRIVATE_KEY=0x... npx tsx register.ts
```

---

## Environment Variables

| Variable | Description | Example |
|---|---|---|
| `PRIVATE_KEY` | Agent wallet private key (hex) | `0xac0974bec...` |

The SDK handles everything else with smart defaults (Base Sepolia, 0.01 ETH fee, API URL).

## What's Next?

- 📖 [Full SDK Reference](../packages/sdk/README.md) — All options, BYO mode, batch, webhooks
- 📋 [Developer Guide](developer-guide-v1.md) — Architecture, security, API reference
- 🐍 Python SDK — Coming soon ([#30](https://github.com/Sebas-Solver/Res-ex-Machina/issues/30))
