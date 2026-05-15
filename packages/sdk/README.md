# @res-ex-machina/sdk

**Official SDK for [Res ex Machina](https://github.com/Sebas-Solver/Res-ex-Machina)** — Neutral registry for AI-generated content provenance.

Reduces integration from ~80 lines to ~5 lines.

## Installation

```bash
npm install @res-ex-machina/sdk viem
```

## Quick Start

```typescript
import { RxMClient } from '@res-ex-machina/sdk';
import { privateKeyToAccount } from 'viem/accounts';

const account = privateKeyToAccount('0x...');

const rxm = new RxMClient({
  account,
  rpcUrl: 'https://sepolia.base.org',
  apiUrl: 'https://res-ex-machina-api.onrender.com',
  feeReceiverAddress: '0x...',
});

// 5 lines: hash → sign → fee → POST
const receipt = await rxm.record('Generated output by AI', {
  modelId: 'openai:gpt-4o:2026-01',
});

console.log(receipt.recordId, receipt.receiptHash);
```

## Usage Modes

### Simple Mode (batteries included)

```typescript
const receipt = await rxm.record(content, {
  modelId: 'openai:gpt-4o:2026-01',
  tags: ['report', 'quarterly'],
  waitForAnchor: true, // wait for blockchain anchoring
});
```

### BYO Mode (Bring Your Own)

For integrators who control fees, hash, or both:

```typescript
const receipt = await rxm.record(content, {
  modelId: 'anthropic:claude-sonnet-4-20250514:2026-01',
  feeTxHash: '0xabc...',    // already paid fee → does NOT pay again
  contentHash: 'sha256:...' // already computed hash → does NOT recompute
});
```

## Batch

```typescript
// v0.1: each item requires feeTxHash (BYO)
const results = await rxm.recordBatch([
  { content: 'Output 1', options: { modelId: 'm:v:1', feeTxHash: '0x...' } },
  { content: 'Output 2', options: { modelId: 'm:v:1', feeTxHash: '0x...' } },
]);
```

## Webhooks

```typescript
// Separate subclient from record()
const wh = await rxm.webhooks.register('https://my-server.com/hook');
console.log(wh.secret); // HMAC secret — shown only once

const list = await rxm.webhooks.list();
await rxm.webhooks.delete(wh.webhookId);
```

## Query & Verification

```typescript
const exists = await rxm.verify('content or sha256:hash');
const detail = await rxm.getRecord('record-id');
const exported = await rxm.export('record-id');
const list = await rxm.listRecords({ state: 'anchored', limit: 10 });
```

## Read-Only Mode

For verifiers, auditors, or dashboards that only need to query public records — no wallet, private key, or RPC needed:

```typescript
const verifier = new RxMClient({
  apiUrl: 'https://res-ex-machina-api.onrender.com',
  readOnly: true,
});

// ✅ These work
const record = await verifier.getRecord('record-id');
const exists = await verifier.verify('sha256:...');
const receipt = await verifier.export('record-id');
const list = await verifier.listRecords({ agentWallet: '0x...' });

// ❌ These throw RxMReadOnlyError
await verifier.record('...');           // → read_only_client
await verifier.recordBatch([...]);      // → read_only_client
await verifier.webhooks.register('...');// → read_only_client
```

**Key rules:**
- `readOnly: true` rejects `account`, `rpcUrl`, `feeReceiverAddress` at both compile time (TypeScript) and runtime (JavaScript)
- `listRecords()` requires `agentWallet` parameter in read-only mode (no default wallet)
- All write operations throw `RxMReadOnlyError` (code: `read_only_client`)

## Error Handling

```typescript
import { RxMRateLimitError, RxMValidationError, RxMReadOnlyError } from '@res-ex-machina/sdk';

try {
  await rxm.record(content, { modelId: '...' });
} catch (e) {
  if (e instanceof RxMRateLimitError) {
    // Agents can retry programmatically
    await sleep(e.retryAfterMs);
  }
  if (e instanceof RxMValidationError) {
    // Local validation error (no API call made)
    console.error(e.code, e.message);
  }
  if (e instanceof RxMReadOnlyError) {
    // Attempted write operation on read-only client
    console.error(e.code, e.message); // code: 'read_only_client'
  }
}
```

## Constructor Options

### Writable Client (full capabilities)

| Option | Type | Default | Description |
|---|---|---|---|
| `account` | `Account` | — | viem Account (required) |
| `rpcUrl` | `string` | — | L2 RPC URL (required) |
| `apiUrl` | `string` | — | RxM API URL (required) |
| `feeReceiverAddress` | `Address` | — | Fee receiver address (required) |
| `feeAmount` | `number` | `0.01` | Fee in native currency (ETH/MATIC) |
| `chainId` | `number` | `84532` | Chain ID (Base Sepolia) |
| `httpTimeoutMs` | `number` | `10000` | HTTP timeout in ms |
| `httpRetries` | `number` | `3` | HTTP retries |

### Read-Only Client (no wallet needed)

| Option | Type | Default | Description |
|---|---|---|---|
| `apiUrl` | `string` | — | RxM API URL (required) |
| `readOnly` | `true` | — | Enables read-only mode (required) |
| `httpTimeoutMs` | `number` | `10000` | HTTP timeout in ms |
| `httpRetries` | `number` | `3` | HTTP retries |

## `record()` Options

| Option | Type | Default | Description |
|---|---|---|---|
| `modelId` | `string` | — | `provider:model:version` (required) |
| `contentType` | `string` | `text/plain` | MIME type |
| `tags` | `string[]` | `[]` | Max 10, 64 chars each |
| `processType` | `ProcessType` | `direct` | `direct\|pipeline\|iterative\|autonomous` |
| `humanInterventionLevel` | `number` | `0` | 0-5 |
| `feeTxHash` | `Hex` | — | BYO: skip fee payment |
| `contentHash` | `string` | — | BYO: skip hash calculation |
| `waitForAnchor` | `boolean` | `false` | Wait for anchoring |

## Requirements

- **Node.js ≥ 18**
- **viem ≥ 2.0** (peerDependency)

## License

ISC
