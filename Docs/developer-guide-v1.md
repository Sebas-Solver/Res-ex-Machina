# Res ex Machina — Developer Guide (v1.0)

> Technical integration guide for software developers and AI agent builders.

---

## Overview

**Res ex Machina (RxM)** is a REST API for registering verifiable Proof of Generation (PoG) records for AI-generated content. Each record is signed with EIP-712, verified on-chain via fee payment, and anchored to an EVM-compatible L2 blockchain.

### Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| API Framework | Fastify | ^5.2.2 |
| Language | TypeScript | ^5.8.3 |
| Database | PostgreSQL | 16 |
| ORM | Drizzle ORM | ^0.39.3 |
| Queue | BullMQ + Redis 7 | ^5.52.1 |
| Blockchain | viem (EVM L2) | ^2.25.3 |
| Validation | Zod | ^3.25.3 |
| Security | @fastify/helmet, @fastify/rate-limit, @fastify/cors | latest |

### Architecture

```
Client (AI Agent)
  │
  │  1. Pay fee on L2 → get tx_hash
  │  2. Build PoG bundle → sign EIP-712
  │  3. POST /v1/records
  │
  ▼
┌─────────────────────────────┐
│         Fastify API         │
│  • Zod validation           │
│  • EIP-712 verify (viem)    │
│  • Fee verification (L2)    │
│  • PostgreSQL INSERT        │
│  • Enqueue anchor job       │
└──────────┬──────────────────┘
           │
     ┌─────┴─────┐
     ▼           ▼
┌─────────┐ ┌──────────────┐
│ Postgres│ │ BullMQ/Redis │
│ records │ │ anchor queue │
└─────────┘ └──────┬───────┘
                   │
                   ▼
            ┌────────────┐
            │ Anchor     │
            │ Worker     │
            │ (viem L2)  │
            └────────────┘
```

---

## API Reference

**Base URL:** `http://localhost:3000/v1` (dev) | `https://api.resexmachina.xyz/v1` (prod, TBD)

### Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/records` | EIP-712 signature | Create a new PoG record |
| `POST` | `/records?wait_for_anchor=true` | EIP-712 signature | Create + wait for anchoring (max 25s) |
| `GET` | `/records/:id` | None | Get record by UUID |
| `GET` | `/records/verify?content_hash=` | None | Verify record exists by hash |
| `GET` | `/records/mine` | EIP-191 wallet signature | List agent's own records |
| `GET` | `/records/:id/export` | None | Export verifiable receipt (JSON) |
| `GET` | `/records/:id/export?mode=compact` | None | Compact receipt (verification only) |
| `GET` | `/health` | None | System health check (cached 30s) |

### Rate Limits

| Scope | Limit | Window | Backend |
|-------|-------|--------|--------|
| Global (all endpoints) | 100 req | 1 min | Redis (with `skipOnError` fallback) |
| POST /records (per wallet) | 10 req | 1 min | Redis (with `skipOnError` fallback) |

> **Note:** Rate limiting is backed by Redis (`@fastify/rate-limit` with `ioredis`). If Redis is temporarily unavailable, rate limiting is bypassed (`skipOnError: true`) to ensure API availability. This is a deliberate degraded-mode tradeoff.

---

## Integration Flow

### Step 1: Pay the fee on L2

Send a native token transfer to the `fee_receiver_address` on the configured L2 chain.

```typescript
import { createWalletClient, http, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { polygonAmoy } from 'viem/chains'; // or your L2 chain

const account = privateKeyToAccount('0xYOUR_PRIVATE_KEY');

const walletClient = createWalletClient({
  account,
  chain: polygonAmoy, // L2 chain
  transport: http('https://rpc-url'),
});

const feeTxHash = await walletClient.sendTransaction({
  to: '0xFEE_RECEIVER_ADDRESS',    // provided by RxM
  value: parseEther('0.01'),       // >= minimum fee
});

// Wait for confirmation
const publicClient = createPublicClient({ chain: polygonAmoy, transport: http() });
await publicClient.waitForTransactionReceipt({ hash: feeTxHash });
```

> **Important:** Each `fee_tx_hash` can only be used once. One fee = one record. The fee transaction must be confirmed and less than 24 hours old.

### Step 2: Build the PoG bundle and sign with EIP-712

```typescript
import { createHash } from 'node:crypto';

// 1. Hash your content
const content = Buffer.from('Your AI-generated output here');
const contentHash = 'sha256:' + createHash('sha256').update(content).digest('hex');

// 2. Build the PoG bundle
const nonce = crypto.randomUUID(); // unique per request

const pogBundle = {
  schema_version: 'pog-v1',
  content_hash: contentHash,
  agent_wallet: account.address,
  timestamp: new Date().toISOString(),
  nonce,
  generation_process: {
    type: 'text',
    human_intervention: 'none',
    pipeline_steps: ['gpt-4o'],
  },
  model: 'gpt-4o-2024-08-06',
  runtime: 'node-22.x',
  signature: '', // filled below
};

// 3. Sign with EIP-712
const domain = {
  name: 'ResExMachina',
  version: '1',
  chainId: 0n,
  verifyingContract: '0x0000000000000000000000000000000000000000' as const,
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

const message = {
  schema: 'pog.v1',
  content_hash: contentHash,
  agent_wallet: account.address,
  model_id: 'openai:gpt-4o:2024-08-06',
  runtime_id: 'sha256:0',
  process_type: 'direct',
  human_intervention_level: 0,
  pipeline_steps: 1,
  timestamp: pogBundle.timestamp,
  nonce,
};

const signature = await walletClient.signTypedData({
  domain,
  types,
  primaryType: 'PoGBundle',
  message,
});

pogBundle.signature = signature;
```

### Step 3: POST to the API

```typescript
const response = await fetch('http://localhost:3000/v1/records', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    content_hash: contentHash,
    pog_bundle: pogBundle,
    fee_tx_hash: feeTxHash,
    content_type: 'text/plain',       // optional
    visibility: 'proof_only',         // default
    tags: ['gpt-4o', 'report'],       // optional, max 10
  }),
});

const record = await response.json();
// record.record_id → UUID v7
// record.state → 'pending_anchor' (will become 'anchored')
// record.receipt_hash → SHA-256 of the receipt
```

### Step 4: Verify and export

```typescript
// Verify by content hash
const verify = await fetch(
  `http://localhost:3000/v1/records/verify?content_hash=${contentHash}`
);
const found = await verify.json(); // 200 if exists, 404 if not

// Get by ID
const get = await fetch(`http://localhost:3000/v1/records/${record.record_id}`);
const detail = await get.json();

// Export receipt (verifiable offline)
const receipt = await fetch(
  `http://localhost:3000/v1/records/${record.record_id}/export`
);
const exportData = await receipt.json();
// exportData.schema → 'rex.receipt.v1'
// exportData.receipt_hash → deterministic SHA-256
```

---

## Request/Response Schemas

### POST /v1/records — Request body

```json
{
  "content_hash": "sha256:e3b0c44298fc1c149afbf4c8996fb924...",
  "pog_bundle": {
    "schema_version": "pog-v1",
    "content_hash": "sha256:e3b0c44...",
    "agent_wallet": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    "timestamp": "2026-02-12T14:30:00.000Z",
    "nonce": "unique-random-string",
    "generation_process": {
      "type": "text",
      "human_intervention": "none",
      "pipeline_steps": ["gpt-4o"]
    },
    "model": "gpt-4o-2024-08-06",
    "runtime": "node-22.x",
    "signature": "0x1234abcd...65bytes"
  },
  "fee_tx_hash": "0xabc123...64hex",
  "content_type": "text/plain",
  "visibility": "proof_only",
  "tags": ["tag1", "tag2"],
  "external_ref": "ipfs://Qm..."
}
```

### 201 Created — Response

```json
{
  "record_id": "01952abc-def0-7890-abcd-ef0123456789",
  "content_hash": "sha256:e3b0c44...",
  "content_type": "text/plain",
  "visibility": "proof_only",
  "pog_bundle": { ... },
  "state": "pending_anchor",
  "created_at": "2026-02-12T14:30:01.234Z",
  "receipt_hash": "sha256:...",
  "fee": {
    "amount": "0.01000000",
    "currency": "ETH",
    "tx_hash": "0xabc123..."
  },
  "anchor": null,
  "tags": ["tag1", "tag2"]
}
```

### GET /v1/records/:id/export — Response

```json
{
  "schema": "rex.receipt.v1",
  "spec_version": "1.2",
  "record_id": "01952abc-def0-7890-abcd-ef0123456789",
  "content_hash": "sha256:e3b0c44...",
  "pog_bundle": {
    "schema": "pog.v1",
    "content_hash": "sha256:e3b0c44...",
    "agent_wallet": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    "model_id": "openai:gpt-4:2025-01",
    "runtime_id": "my-agent-v1",
    "signature": "0xabc123...",
    "eip712_domain": {
      "name": "ResExMachina",
      "version": "1",
      "chain_id": 0,
      "verifying_contract": "0x0000000000000000000000000000000000000000"
    }
  },
  "receipt_hash": "sha256:...",
  "verification": {
    "receipt_hash_algo": "sha256",
    "receipt_canonicalization": "pipe-separated",
    "receipt_fields": "record_id|content_hash|agent_wallet_lowercase|nonce|created_at_iso8601",
    "eip712_primary_type": "PoGBundle"
  },
  "state": "anchored",
  "created_at": "2026-02-12T14:30:01.234Z",
  "fee": {
    "amount": "0.00020000",
    "currency": "ETH",
    "tx_hash": "0xfee123...",
    "chain_id": 84532,
    "to": "0x13bB040691BBa236a2A2AB83fE904EcC965Ba8a0"
  },
  "anchor": {
    "tx_hash": "0xdef456...",
    "block": 12345678,
    "chain_id": 84532,
    "anchored_at": "2026-02-12T14:32:15.000Z",
    "anchored_hash": "sha256:...",
    "anchor_method": "calldata"
  }
}
```

---

## Error Handling

All errors follow this format:

```json
{
  "error": {
    "code": "error_code",
    "message": "Human-readable description",
    "details": {}
  }
}
```

### Error Codes Reference

| HTTP | Code | When |
|------|------|------|
| 400 | `invalid_payload` | Malformed or incomplete request body |
| 400 | `invalid_content_hash` | Hash not matching `sha256:{64hex}` |
| 400 | `invalid_pog_schema` | PoG bundle doesn't match v1 schema |
| 400 | `invalid_pog_version` | `schema_version` is not `pog-v1` |
| 400 | `invalid_tags` | Tags array > 10 items, empty strings, or wrong type |
| 400 | `invalid_visibility` | Not one of: `proof_only`, `input_hash_only`, `content_optional` |
| 401 | `invalid_signature` | EIP-712 signature is malformed or unverifiable |
| 401 | `signer_mismatch` | Recovered signer ≠ declared `agent_wallet` |
| 401 | `missing_auth_headers` | `GET /records/mine` called without auth headers |
| 401 | `invalid_wallet_address` | `X-Wallet-Address` is not a valid Ethereum address |
| 401 | `auth_timestamp_expired` | `X-Timestamp` is older than 5 minutes |
| 401 | `auth_signature_invalid` | EIP-191 signature verification failed |
| 402 | `fee_not_verified` | Fee tx not found, unconfirmed, or failed on-chain |
| 402 | `fee_insufficient` | Fee amount < minimum required |
| 402 | `fee_wrong_recipient` | Fee tx `to` address doesn't match `fee_receiver_address` |
| 402 | `fee_tx_expired` | Fee tx is older than 24 hours |
| 402 | `fee_tx_reused` | Fee tx hash already used for another record |
| 405 | `method_not_allowed` | DELETE on records (records are immutable) |
| 409 | `duplicate_content_hash` | Record with this content_hash already exists |
| 409 | `duplicate_nonce` | This nonce was already used by this wallet |
| 413 | `payload_too_large` | Request body exceeds 64KB |
| 429 | `rate_limit_exceeded` | Rate limit hit (see headers for reset time) |
| 500 | `internal_error` | Unexpected error (no details exposed) |

### Rate Limit Response Headers

When rate-limited, the response includes:

```json
{
  "error": {
    "code": "rate_limit_exceeded",
    "message": "Rate limit exceeded, retry in 4 seconds",
    "details": {
      "max": 10,
      "remaining": 0,
      "reset": "4 seconds"
    }
  }
}
```

---

## EIP-712 Signature Specification

### Domain

```json
{
  "name": "ResExMachina",
  "version": "1",
  "chainId": 0,
  "verifyingContract": "0x0000000000000000000000000000000000000000"
}
```

> `chainId: 0` and zero-address because signatures are off-chain. This will change when on-chain contracts are deployed.

### Types

```json
{
  "PoGBundle": [
    { "name": "schema",         "type": "string" },
    { "name": "content_hash",   "type": "string" },
    { "name": "agent_wallet",   "type": "address" },
    { "name": "model_id",       "type": "string" },
    { "name": "runtime_id",     "type": "string" },
    { "name": "process_type",   "type": "string" },
    { "name": "human_intervention_level", "type": "uint8" },
    { "name": "pipeline_steps", "type": "uint16" },
    { "name": "timestamp",      "type": "string" },
    { "name": "nonce",          "type": "string" }
  ]
}
```

### Message Mapping

| EIP-712 field | Source in PoG bundle |
|---------------|---------------------|
| `schema` | `"pog.v1"` (literal) |
| `content_hash` | `pog_bundle.content_hash` |
| `agent_wallet` | `pog_bundle.agent_wallet` |
| `model_id` | `"provider:model:version"` format |
| `runtime_id` | SHA-256 of runtime env, or `"sha256:0"` |
| `process_type` | `generation_process.type` mapped to: `direct`, `pipeline`, `iterative`, `autonomous` |
| `human_intervention_level` | `0-5` integer (see PoG spec) |
| `pipeline_steps` | Count of pipeline steps |
| `timestamp` | ISO-8601 UTC with ms |
| `nonce` | Unique string per request |

---

## Fee Verification Flow

The API verifies the `fee_tx_hash` against the L2 blockchain with 5 checks:

```
1. tx_exists      → getTransaction(hash) succeeds
2. tx_confirmed   → getTransactionReceipt(hash).status === 'success'
3. tx_amount      → tx.value >= FEE_MINIMUM_AMOUNT
4. tx_recipient   → tx.to === FEE_RECEIVER_ADDRESS (case-insensitive)
5. tx_recent      → block.timestamp within 24h of now
```

Additionally, `fee_tx_hash` uniqueness is enforced by a UNIQUE DB constraint — one fee tx = one record.

### Fee Configuration (Environment)

| Variable | Description | Example |
|----------|-------------|---------|
| `FEE_RECEIVER_ADDRESS` | Ethereum address receiving fees | `0xf39F...2266` |
| `FEE_MINIMUM_AMOUNT` | Minimum fee in ETH | `0.01` |
| `L2_RPC_URL` | L2 JSON-RPC endpoint | `http://localhost:8545` |
| `L2_CHAIN_ID` | Chain ID of the L2 | `31337` (Anvil) |

---

## Record States

```
pending_anchor  →  anchored       (success: tx mined on L2)
pending_anchor  →  anchor_failed  (after 5 retries with exponential backoff)
```

| State | Meaning | Anchor data |
|-------|---------|-------------|
| `pending_anchor` | Record created, awaiting blockchain write | `anchor: null` |
| `anchored` | Record permanently stored on-chain | `anchor: { tx_hash, block, chain_id, anchored_at }` |
| `anchor_failed` | All retry attempts exhausted | `anchor_error_reason` populated |

The anchor worker uses BullMQ with exponential backoff: 5s → 10s → 20s → 40s → 80s (5 attempts max, concurrency 3).

---

## Wallet Authentication (GET /records/mine)

`GET /records/mine` is a protected endpoint that requires **EIP-191 (personal_sign)** authentication.

### Auth Headers

| Header | Description | Example |
|--------|-------------|--------|
| `X-Wallet-Address` | The agent's Ethereum address | `0xDd6894b5...` |
| `X-Signature` | EIP-191 signature of the auth message | `0x4f8e...` |
| `X-Timestamp` | ISO-8601 timestamp (must be within 5 minutes) | `2026-02-16T12:00:00.000Z` |

### Auth Message Format

The message to sign is: `RexAuth:{timestamp}` where `{timestamp}` is the same `X-Timestamp` value.

```typescript
import { privateKeyToAccount } from 'viem/accounts';

const account = privateKeyToAccount('0xYOUR_PRIVATE_KEY');
const timestamp = new Date().toISOString();
const message = `RexAuth:${timestamp}`;

// Sign with personal_sign (EIP-191)
const signature = await account.signMessage({ message });

// Make the authenticated request
const response = await fetch('https://api.example.com/v1/records/mine?limit=20', {
  headers: {
    'X-Wallet-Address': account.address,
    'X-Signature': signature,
    'X-Timestamp': timestamp,
  },
});

const { records, pagination } = await response.json();
```

### Response

```json
{
  "records": [
    {
      "record_id": "01952abc-...",
      "content_hash": "sha256:...",
      "state": "anchored",
      "created_at": "2026-02-14T..."
    }
  ],
  "pagination": {
    "total": 12,
    "limit": 20,
    "offset": 0,
    "has_more": false
  }
}
```

> **Note:** This is a different auth mechanism than `POST /records` (which uses EIP-712). EIP-191 (`personal_sign`) is simpler and sufficient for read-only endpoints.

---

## Health Check & Caching

`GET /v1/health` checks the status of all subsystems (DB, Redis, L2 blockchain) and returns a summary.

### Caching

Health check results are **cached for 30 seconds** (in-memory TTL cache) to reduce load on Upstash and L2 RPC, especially on free tiers.

### Response Headers

| Header | Value | When |
|--------|-------|------|
| `Cache-Control` | `public, max-age=30` | Always |
| `X-Cache` | `HIT` | Response served from cache |
| `X-Cache` | `MISS` | Fresh response (cache refreshed) |
| `Retry-After` | `30` | When status is 503 (degraded) |

### Health States

| HTTP | `status` field | Meaning |
|------|----------------|-------|
| 200 | `healthy` | All subsystems operational |
| 503 | `degraded` | One or more subsystems down |

---

## Degraded Mode (Resilience)

The API is designed to remain functional even when external services (Redis, L2 blockchain) are temporarily unavailable.

### How it works

| Service Down | Impact | Failsafe |
|-------------|--------|----------|
| **Redis** | Rate limiting disabled | `skipOnError: true` — requests are allowed without rate limiting |
| **Redis** | Anchor job can't be enqueued | `try/catch` — record saved to DB with `state: pending_anchor`; job will be enqueued when Redis reconnects |
| **Redis** | Health check shows `degraded` | Cached for 30s; `Retry-After: 30` header returned |
| **L2 blockchain** | Fee verification fails | POST /records returns 402 (expected) |
| **L2 blockchain** | Anchoring fails | Worker retries up to 5 times with exponential backoff |
| **L2 blockchain** | Health check shows `degraded` | Cached for 30s; `Retry-After: 30` header |

### Key design decisions

- **Availability over strictness:** When Redis goes down, it's better to serve requests without rate limiting than to return 500 errors to all users.
- **Records are always saved:** Even if the anchor job can't be enqueued, the record is persisted in PostgreSQL. No data is lost.
- **Workers are passive:** The anchor worker reconnects automatically when Redis comes back. Pending jobs are processed.
- **Health cache reduces blast radius:** A 30s cache prevents cascading failures when external services are slow or unreachable.

---

## Database Schema

Main table: `records`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `record_id` | UUID (v7) | PK | Application-generated |
| `content_hash` | VARCHAR(128) | UNIQUE, NOT NULL, CHECK regex | `sha256:{64hex}` |
| `content_type` | VARCHAR(64) | nullable | MIME type |
| `visibility` | VARCHAR(32) | NOT NULL, DEFAULT 'proof_only', CHECK | Enum: proof_only, input_hash_only, content_optional |
| `pog_bundle` | JSONB | NOT NULL | Complete PoG v1 bundle |
| `nonce` | VARCHAR(64) | NOT NULL | Anti-replay |
| `agent_wallet` | VARCHAR(42) | NOT NULL | EVM address |
| `state` | VARCHAR(32) | NOT NULL, DEFAULT 'pending_anchor', CHECK | Enum: pending_anchor, anchored, anchor_failed |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Creation time |
| `receipt_hash` | VARCHAR(128) | NOT NULL | SHA-256 of receipt |
| `tags` | TEXT[] | DEFAULT '{}' | Max 10 |
| `external_ref` | TEXT | nullable | URL/pointer |
| `fee_amount` | NUMERIC(18,8) | NOT NULL | Fee paid |
| `fee_currency` | VARCHAR(8) | NOT NULL | e.g. "ETH" |
| `fee_tx_hash` | VARCHAR(66) | UNIQUE, NOT NULL | Fee payment tx |
| `anchor_tx_hash` | VARCHAR(66) | nullable | Anchor tx |
| `anchor_block` | BIGINT | nullable | Block number |
| `anchor_chain_id` | INTEGER | nullable | Chain ID |
| `anchor_error_reason` | TEXT | nullable | Error detail |
| `anchor_retries` | INTEGER | NOT NULL, DEFAULT 0 | Retry count |
| `anchored_at` | TIMESTAMPTZ | nullable | When anchored |

### Indexes & Constraints

- `UNIQUE(agent_wallet, nonce)` — anti-replay
- `UNIQUE(content_hash)` — idempotency
- `UNIQUE(fee_tx_hash)` — fee reuse prevention
- `INDEX(agent_wallet)` — query by wallet
- `INDEX(state)` — worker queries pending_anchor
- `INDEX(created_at)` — time ordering
- `INDEX(fee_tx_hash)` — fee lookup

---

## Local Development Setup

### Prerequisites

- Node.js 22+
- Docker & Docker Compose
- An Ethereum private key (for signing)

### Quick Start

```bash
# 1. Clone and install
git clone https://github.com/Sebas-Solver/Res-ex-Machina.git
cd Res-ex-Machina
npm install

# 2. Start infrastructure (Postgres, Redis, Anvil)
docker compose up -d

# 3. Wait for healthchecks (~30s)
docker compose ps  # all should be "healthy"

# 4. Apply database schema
npm run db:push

# 5. Start API server
npm run dev

# 6. Start anchor worker (separate terminal)
npm run worker:anchor

# 7. Verify
curl http://localhost:3000/v1/health
```

### Environment Variables (.env)

```env
# Server
PORT=3000
NODE_ENV=development
LOG_LEVEL=info

# Database
DATABASE_URL=postgres://rexm:rexm_dev_password@localhost:5432/rexm

# Redis
REDIS_URL=redis://localhost:6379

# Blockchain L2
L2_RPC_URL=http://localhost:8545
L2_CHAIN_ID=31337
FEE_RECEIVER_ADDRESS=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
FEE_MINIMUM_AMOUNT=0.01

# Anchoring (Anvil default account #0)
ANCHOR_WALLET_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

### Available npm Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start API (dev mode with pino-pretty) |
| `npm run worker:anchor` | Start anchor worker |
| `npm run check` | Run tsc type checking |
| `npm test` | Run vitest (100 tests) |
| `npm run db:push` | Apply schema to database |
| `npm run alpha:happy` | Run Agent A happy path test |
| `npm run alpha:adversarial` | Run Agent D adversarial test |
| `npm run alpha:all` | Run both alpha tests |

---

## Offline Receipt Verification

Receipts exported via `/records/:id/export` are self-contained and can be verified without the API.

### CLI Verifier (recommended)

The easiest way to verify:

```bash
# From a JSON file
npx tsx scripts/verify-receipt.ts receipt.json

# Directly from the API
npx tsx scripts/verify-receipt.ts https://res-ex-machina-api.onrender.com/v1/records/{id}/export
```

Output:
```
1️⃣  Verificando receipt_hash...
   ✅ VÁLIDO — hash recalculado coincide
2️⃣  Verificando firma EIP-712...
   ✅ VÁLIDA — firmado por 0xDd68...
3️⃣  Verificando anchoring en blockchain...
   ✅ CONFIRMADO — bloque 37655645
📋 Veredicto: ✅ RECORD AUTÉNTICO
```

### Manual Verification

For full specification see: [Receipt Verification Spec](receipt-verification-spec.md)

```typescript
import { createHash } from 'node:crypto';
import { verifyTypedData, createPublicClient, http } from 'viem';

// 1. Recalculate receipt_hash (pipe-separated canonicalization)
const canonical = [
  receipt.record_id,
  receipt.content_hash,
  receipt.pog_bundle.agent_wallet.toLowerCase(),
  receipt.pog_bundle.nonce,
  receipt.created_at,
].join('|');
const computed = 'sha256:' + createHash('sha256').update(canonical).digest('hex');
console.assert(computed === receipt.receipt_hash, 'Receipt hash mismatch!');

// 2. Verify EIP-712 signature (domain included in receipt since alpha.2)
const domain = receipt.pog_bundle.eip712_domain;
const isValid = await verifyTypedData({
  address: receipt.pog_bundle.agent_wallet,
  domain: {
    name: domain.name,
    version: domain.version,
    chainId: domain.chain_id,
    verifyingContract: domain.verifying_contract,
  },
  types: { PoGBundle: [...] }, // see EIP-712 section above
  primaryType: 'PoGBundle',
  message: { /* mapped fields from pog_bundle */ },
  signature: receipt.pog_bundle.signature,
});
console.assert(isValid, 'Signature invalid!');

// 3. Verify anchor on-chain
if (receipt.anchor?.tx_hash) {
  const tx = await publicClient.getTransaction({ hash: receipt.anchor.tx_hash });
  const calldata = Buffer.from(tx.input.slice(2), 'hex').toString('utf-8');
  console.assert(
    calldata === receipt.anchor.anchored_hash,
    'Anchor calldata does not match receipt_hash!'
  );
}
```

---

## Trust Model & Declarative Fields

### Identity Model

A wallet (`agent_wallet`) represents a **technical identity**, not necessarily a legal person. It can correspond to:
- A human developer
- An organization or company
- An autonomous AI agent
- A pipeline or orchestrator service

**Best practice:** Use **one wallet per agent** for maximum granularity. This allows you to:
- Distinguish which agent created which records
- Apply per-agent rate limits naturally
- Revoke or rotate agent identities independently
- Build reputation and trust signals per agent over time

```
❌ One wallet for everything    →  All records look identical
✅ One wallet per agent         →  Clear provenance per agent
✅ One wallet per agent+env     →  Separate prod vs dev identities
```

### Verified vs. Declarative Fields

Not all fields in a PoG bundle carry the same trust level:

| Field | Trust level | How it's verified |
|-------|-------------|-------------------|
| `agent_wallet` | **Cryptographically verified** | EIP-712 signature recovery proves the wallet holder signed |
| `content_hash` | **Cryptographically verified** | Deterministic SHA-256; content can be re-hashed to verify |
| `nonce` | **DB-enforced** | UNIQUE constraint per wallet prevents replay |
| `fee_tx_hash` | **On-chain verified** | Checked against L2 blockchain (amount, recipient, recency) |
| `timestamp` | **Declared by agent** | Server adds `created_at` but agent's timestamp is not verified |
| `model_id` | **Declared by agent** | RxM records and signs it, but cannot verify which model ran |
| `runtime_id` | **Declared by agent** | Agent provides its runtime hash; not independently verified |
| `human_intervention_level` | **Declared by agent** | Self-reported; RxM registers the claim, doesn't judge it |
| `generation_process.type` | **Declared by agent** | Self-reported process classification |

> **Key insight:** The `model_id` field (format: `provider:model:version`) is a **declarative attestation** by the agent. RxM signs and permanently records this claim, but does not verify which model actually executed. This is similar to a signed declaration — the value lies in:
> - **Immutable record** of what was declared (lies are permanently recorded too)
> - **Cross-referencing** with model availability dates and capabilities
> - **Accountability** through reputation and consistency analysis
> - **Future verification** via model fingerprinting techniques (roadmap)

### Recommendations for Integrators

1. **Be accurate in declarations** — false `model_id` or `human_intervention_level` values undermine the credibility of your records
2. **Use meaningful `runtime_id`** — hash your Docker image, lock file, or system fingerprint for reproducibility context
3. **Generate `nonce` securely** — use `crypto.randomUUID()` or equivalent; predictable nonces are a security risk
4. **Use `sha256:0` explicitly** — if you cannot determine your runtime, use the null-explicit value rather than a random hash

---

## Security Model

| Layer | Mechanism |
|-------|-----------|
| Identity | EVM wallets (non-custodial, agent manages own keys) |
| Authentication | EIP-712 typed data signatures |
| Anti-spam | Fee per record + rate limiting |
| Anti-replay | Unique nonce per wallet (DB constraint) |
| Idempotency | Unique content_hash (DB constraint) |
| Fee reuse | Unique fee_tx_hash (DB constraint) |
| Immutability | No DELETE, no UPDATE on core fields (INV-001, INV-002) |
| Transport | HTTPS (in production) |
| Headers | @fastify/helmet (CSP, XSS, clickjacking protection) |
| Error safety | Never exposes stack traces, SQL, or internal paths |

### Invariants

| ID | Rule |
|----|------|
| INV-001 | Records are permanent — no DELETE |
| INV-002 | No UPDATE on post-creation fields |
| INV-012 | No record exists without a paid fee |
| INV-014 | Nonce uniqueness per wallet |
| INV-020 | Fee is verified against real on-chain tx |

---

## Batch Endpoint (POST /v1/records/batch)

Register up to **100 records** in a single API call. Each record is processed independently — failures in one record don't affect others.

### Request

```typescript
const response = await fetch('https://api.example.com/v1/records/batch', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    records: [
      {
        content_hash: 'sha256:abc123...',
        pog_bundle: { /* same as POST /v1/records */ },
        fee_tx_hash: '0x111...',        // Each record needs its own fee
        content_type: 'text/plain',
      },
      {
        content_hash: 'sha256:def456...',
        pog_bundle: { /* ... */ },
        fee_tx_hash: '0x222...',        // Different fee tx
        content_type: 'image/png',
      },
    ],
  }),
});
```

### Response Status Codes

| Code | Meaning |
|------|---------|
| `201` | All records created successfully |
| `207` | Mixed results — some succeeded, some failed |
| `400` | All records failed (or invalid batch format) |

### Response Body

```json
{
  "results": [
    { "index": 0, "success": true,  "record": { "record_id": "...", "state": "pending_anchor" } },
    { "index": 1, "success": false, "error": { "code": "duplicate_content_hash", "message": "..." } }
  ],
  "summary": { "total": 2, "succeeded": 1, "failed": 1 }
}
```

### Rate Limit

**5 requests/minute per wallet** (more restrictive than single record endpoint).

---

## Webhooks — State Change Notifications

Receive HTTP push notifications when a record's state changes (`pending_anchor` → `anchored` or `anchor_failed`).

### Security Model

| Measure | Implementation |
|---------|---------------|
| **Authentication** | All webhook endpoints require `walletAuth` (EIP-191 signature) |
| **SSRF Prevention** | Only HTTPS URLs accepted. DNS resolved, private/localhost/link-local IPs blocked. No redirect following |
| **Payload Signing** | HMAC-SHA256 in `X-RxM-Signature` header. Secret is server-generated (32 bytes hex) |
| **Deduplication** | Each delivery includes `delivery_id` (UUID) and `attempt` number |
| **Async Dispatch** | BullMQ queue — webhook delivery never blocks the anchoring process |
| **Retries** | 3 attempts with custom backoff: 5s → 30s → 120s |
| **Timeout** | 5-second timeout per HTTP request |
| **Limits** | Maximum 5 active webhooks per wallet |

### Register a Webhook

```typescript
const timestamp = new Date().toISOString();
const signature = await account.signMessage({ message: `RexAuth:${timestamp}` });

const response = await fetch('https://api.example.com/v1/webhooks', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Wallet-Address': account.address,
    'X-Signature': signature,
    'X-Timestamp': timestamp,
  },
  body: JSON.stringify({
    url: 'https://your-server.com/webhook',
    events: ['state_changed'],
  }),
});

const webhook = await response.json();
// webhook.secret → "a1b2c3d4..." (SAVE THIS — shown only once!)
// webhook.webhook_id → UUID
```

### Webhook Payload

When a record's state changes, you receive:

```json
{
  "delivery_id": "550e8400-e29b-41d4-a716-446655440000",
  "attempt": 1,
  "event": "state_changed",
  "timestamp": "2026-02-16T16:00:00.000Z",
  "data": {
    "record_id": "01952abc-def0-7890-abcd-ef0123456789",
    "old_state": "pending_anchor",
    "new_state": "anchored",
    "anchor_tx_hash": "0xabc123...",
    "anchor_block": 12345678,
    "anchor_chain_id": 84532
  }
}
```

### Verify Webhook Signature

```typescript
import { createHmac } from 'crypto';

function verifyWebhook(body: string, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(body).digest('hex');
  return `sha256=${expected}` === signature;
}

// In your webhook handler:
app.post('/webhook', (req, res) => {
  const isValid = verifyWebhook(
    JSON.stringify(req.body),
    req.headers['x-rxm-signature'],
    YOUR_SAVED_SECRET,
  );
  if (!isValid) return res.status(401).send('Invalid signature');
  
  // Process the webhook...
  // Use delivery_id for idempotency
});
```

### List Webhooks

```typescript
const response = await fetch('https://api.example.com/v1/webhooks', {
  headers: {
    'X-Wallet-Address': account.address,
    'X-Signature': signature,
    'X-Timestamp': timestamp,
  },
});
// Returns: { webhooks: [...], total: N }
// Note: secrets are NEVER returned in list responses
```

### Delete a Webhook

```
DELETE /v1/webhooks/{webhook_id}
```

Soft-deletes the webhook (deactivates it). Only the owner wallet can delete.

## SDK Integration (`@res-ex-machina/sdk`)

The TypeScript SDK abstracts the entire registration flow into a single method call:

```typescript
import { RxMClient } from '@res-ex-machina/sdk';

const rxm = new RxMClient({
  account: agentWallet,       // viem LocalAccount
  rpcUrl: 'https://...',      // L2 RPC endpoint
  apiUrl: 'https://...',      // RxM API base URL
});

// Register — internally: hash → sign EIP-712 → pay fee → POST /v1/records
const receipt = await rxm.record('Generated content...', {
  modelId: 'openai:gpt-4o:2026-01',
  contentType: 'text/plain',
  tags: ['report'],
});

// BYO mode — skip automatic fee payment
const receipt2 = await rxm.record('Content...', {
  modelId: 'anthropic:claude-sonnet-4-20250514:2026-01',
  feeTxHash: '0x...',  // Your own on-chain fee tx
});

// Webhooks
const webhook = await rxm.webhooks.register('https://my-server.com/hook');
const list = await rxm.webhooks.list();

// Verify & export
const verified = await rxm.verify(contentHash);
const exported = await rxm.export(recordId);
```

For full documentation, see [`packages/sdk/README.md`](../packages/sdk/README.md).

---

## Changelog

See [CHANGELOG.md](../CHANGELOG.md) for the full release history.

Current version: **v1.0.0-alpha.2-dev** (2026-02-16)

## Further Reading

- [PoG v1 Specification](10-specs/pog-v1-spec.md) — Full schema, EIP-712 types, verification algorithm
- [Fee Flow v1](10-specs/fee-flow-v1.md) — Fee payment and verification details
- [Error Catalog](10-specs/error-catalog.md) — Complete error code reference
- [OpenAPI v1](10-specs/openapi-v1.yaml) — Machine-readable API spec
- [Runbook](runbook.md) — Operations guide for troubleshooting
- [Alpha Test Report](alpha-test-report.md) — Test results and regression data

