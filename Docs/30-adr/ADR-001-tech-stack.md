# ADR-001: Tech Stack v1

> **Status**: Approved  
> **Date**: 2026-02-10  
> **Context**: Implementation decisions for the MVP v1  

---

## Decision

| Layer | Technology | Minimum Version |
|---|---|---|
| Language | TypeScript | 5.x |
| Runtime | Node.js | 22 LTS |
| API Framework | Fastify | 5.x |
| ORM | Drizzle ORM | 0.38+ |
| Database | PostgreSQL | 16 |
| Task Queue | BullMQ | 5.x |
| Cache / Queue backend | Redis | 7.x |
| Crypto / Blockchain | viem | 2.x |
| UUID | uuidv7 (npm package) | — |
| Testing | Vitest | 3.x |
| Containers | Docker Compose | — |
| Validation | Zod + JSON Schema (Fastify) | — |

---

## Justification

### TypeScript + Node.js
- The Ethereum ecosystem (EIP-712 signatures, RPC) is native in JS/TS.
- BullMQ is a Node.js library.
- TypeScript adds type safety, critical for data integrity.

### Fastify (not Express, not NestJS)
- Built-in validation with JSON Schema (reuses our OpenAPI spec).
- Better performance than Express.
- Lighter than NestJS for an MVP.

### Drizzle ORM (not Prisma, not raw SQL)
- Close to real SQL: allows defining complex CHECK constraints and UNIQUEs.
- Type-safe with TypeScript.
- Automatic migrations.
- Lighter than Prisma.

### viem (not ethers.js)
- First-class native support for EIP-712.
- Designed for TypeScript from scratch.
- Modern and lightweight API.

### Dual validation: Zod + JSON Schema
- **Zod**: programmatic validation in business logic (content_hash format, PoG schema).
- **JSON Schema (Fastify built-in)**: automatic HTTP payload validation at the framework level.
- Both are complementary and cover different layers.

---

## Mandatory nuances (approved by the founder)

### 1. UUID v7 generated in the application
```
- YES: import { uuidv7 } from 'uuidv7'; → record_id = uuidv7()
- NO: gen_random_uuid() in PostgreSQL
- Reason: time-ordered, controlled by app, no DB dependency
```

### 2. BullMQ with retries/backoff + anchor_failed
```yaml
anchor_worker:
  retries: 3
  backoff:
    type: exponential
    delay: 5000       # 5s → 10s → 20s
  on_max_retries:
    state: anchor_failed
    anchor_error_reason: "max retries exceeded"
  idempotent: true    # reprocessing a job does not duplicate tx
```
- The worker must be **idempotent**: if it reprocesses a job, it first checks if the tx has already been sent.
- A record with `anchor_failed` is still valid (INV-019).

### 3. Strict payload validation
```
Layer 1 (Fastify):  Automatic JSON Schema → rejects malformed payloads
Layer 2 (Zod):      Business validation → content_hash regex, PoG schema
Layer 3 (DB):       CHECK constraints → last line of defense
```
- No invalid data reaches the database.

---

## Planned folder structure

```
src/
├── config/           # Environment variables, constants
├── db/
│   ├── schema.ts     # Drizzle schema (records table)
│   └── migrations/   # Generated SQL migrations
├── routes/
│   ├── health.ts     # GET /v1/health
│   ├── records.ts    # POST + GET /v1/records
│   └── schemas/      # JSON Schemas for Fastify
├── services/
│   ├── signature.ts  # EIP-712 verification (viem)
│   ├── fee.ts        # On-chain fee verification
│   ├── receipt.ts    # receipt_hash calculation
│   └── anchor.ts     # Anchoring logic
├── workers/
│   └── anchor.worker.ts  # BullMQ worker
├── middleware/
│   └── rateLimit.ts  # Rate limiting
├── utils/
│   └── uuid.ts       # UUID v7 generation
└── app.ts            # Fastify entry point
```

---

## Discarded alternatives

| Alternative | Why not |
|---|---|
| Python / FastAPI | Less mature crypto ecosystem, BullMQ not available |
| Express | No built-in validation, slower |
| NestJS | Too heavy for MVP |
| Prisma | Difficult to define complex CHECK constraints |
| ethers.js | Less modern API, worse native EIP-712 support |
| gen_random_uuid() | Not time-ordered, not controlled by app |
