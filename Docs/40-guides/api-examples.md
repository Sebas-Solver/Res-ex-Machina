# API Usage Examples — Res ex Machina

## Prerequisites

```bash
# Start environment
docker compose up -d

# Apply database schema
npx drizzle-kit push

# Start API
npm run dev          # → http://localhost:3000

# Start worker (another terminal)
npm run worker:anchor
```

---

## 1. Health check

```bash
curl -s http://localhost:3000/v1/health | jq
```

Expected response (public):
```json
{
  "status": "ok",
  "version": "v1",
  "timestamp": "2026-02-10T20:00:00.000Z"
}
```

Admin response (with `X-Admin-Key` header):
```json
{
  "status": "ok",
  "version": "v1",
  "timestamp": "2026-02-10T20:00:00.000Z",
  "checks": {
    "database": { "status": "ok", "latencyMs": 2 },
    "redis": { "status": "ok", "latencyMs": 1 },
    "blockchain": { "status": "ok", "latencyMs": 150, "blockNumber": 12345678 }
  }
}
```

---

## 2. Register a generation fact (POST /records)

```bash
curl -X POST http://localhost:3000/v1/records \
  -H "Content-Type: application/json" \
  -d '{
    "pog_bundle": {
      "schema": "pog.v1",
      "content_hash": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "agent_wallet": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      "model_id": "openai:gpt-4o:2026-01",
      "runtime_id": "node-22.x",
      "generation_process": {
        "process_type": "direct",
        "human_intervention_level": 0,
        "pipeline_steps": 1
      },
      "timestamp": "2026-02-10T19:00:00.000Z",
      "nonce": "unique-nonce-1234567890",
      "signature": "0x<EIP-712 signature of 130 hex chars>"
    },
    "content_type": "text/plain",
    "visibility": "proof_only",
    "tags": ["generated", "text"],
    "fee_amount": 0.0001,
    "fee_currency": "ETH",
    "fee_tx_hash": "0x<fee payment tx hash on Base Sepolia>"
  }' | jq
```

Response (201 Created):
```json
{
  "record_id": "01936d8a-1234-7000-8000-000000000001",
  "state": "pending_anchor",
  "receipt_hash": "sha256:abc123...",
  "created_at": "2026-02-10T19:00:05.123Z"
}
```

---

## 3. Query a record by ID

```bash
curl -s http://localhost:3000/v1/records/01936d8a-1234-7000-8000-000000000001 | jq
```

---

## 4. Verify existence by content_hash

```bash
curl -s "http://localhost:3000/v1/records/verify?content_hash=sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" | jq
```

Response (200):
```json
{
  "exists": true,
  "record_id": "01936d8a-1234-7000-8000-000000000001",
  "state": "anchored",
  "created_at": "2026-02-10T19:00:05.123Z",
  "receipt_hash": "sha256:abc123..."
}
```

---

## 5. Export verifiable receipt

```bash
curl -s http://localhost:3000/v1/records/01936d8a-1234-7000-8000-000000000001/export | jq
```

Response: complete receipt with anchor data (see `verify-pog-offline.md`).

---

## 6. Attempt DELETE (should fail)

```bash
curl -X DELETE http://localhost:3000/v1/records/01936d8a-1234-7000-8000-000000000001 | jq
```

Response (405):
```json
{
  "error": {
    "code": "method_not_allowed",
    "message": "Records are permanent and cannot be deleted (INV-001)"
  }
}
```

---

## Common Error Codes

| Status | Code | Cause |
|---|---|---|
| 400 | `invalid_payload` | Malformed body |
| 400 | `invalid_pog_schema` | Invalid PoG bundle |
| 400 | `invalid_content_hash` | Hash is not sha256:{64hex} |
| 401 | `invalid_signature` | Invalid EIP-712 signature |
| 401 | `signer_mismatch` | Signer ≠ agent_wallet |
| 402 | `fee_not_verified` | Fee tx not found |
| 402 | `fee_insufficient` | Insufficient payment |
| 402 | `fee_wrong_recipient` | Incorrect recipient |
| 402 | `fee_tx_expired` | Tx > 24h |
| 409 | `fee_tx_reused` | Fee tx already used |
| 404 | `record_not_found` | Record does not exist |
| 405 | `method_not_allowed` | DELETE forbidden |
| 409 | `duplicate_content_hash` | Hash already registered |
| 409 | `duplicate_nonce` | Reused nonce |
| 429 | `rate_limit_exceeded` | Too many requests |

---

## How to generate an EIP-712 signature (for testing)

```typescript
import { privateKeyToAccount } from 'viem/accounts';
import { signTypedData } from 'viem/accounts';

// Use an Anvil default account for local testing
// See: https://book.getfoundry.sh/reference/anvil/#default-accounts
const account = privateKeyToAccount('0x_YOUR_ANVIL_PRIVATE_KEY');

const signature = await account.signTypedData({
  domain: {
    name: 'ResExMachina',
    version: '1',
    chainId: 0,
    verifyingContract: '0x0000000000000000000000000000000000000000',
  },
  types: {
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
  },
  primaryType: 'PoGBundle',
  message: {
    schema: 'pog.v1',
    content_hash: 'sha256:e3b0c44298fc1c149afbf4c8996fb924...',
    agent_wallet: account.address,
    model_id: 'openai:gpt-4o:2026-01',
    runtime_id: 'node-22.x',
    process_type: 'direct',
    human_intervention_level: 0,
    pipeline_steps: 1,
    timestamp: new Date().toISOString(),
    nonce: `nonce-${Date.now()}-${Math.random().toString(36)}`,
  },
});
```
