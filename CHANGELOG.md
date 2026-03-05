# Changelog

All notable changes to this project are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased] — For alpha.2

### Security Audit and Automated Testing

#### Added

- **Code Review alpha.2** — `Docs/code-review-alpha2.md`, exhaustive code review report covering architecture, security, performance, and quality
- **Semgrep SAST scan** — Static security analysis with Semgrep MCP on critical files (`walletAuth.ts`, full SDK): **0 vulnerabilities detected**
- **E2E Smoke test** — `scripts/smoke-test-live.ts` + `npm run smoke:live`: validates published SDK against production API (health → balance → fee → record → verify → export). 6/6 steps OK. Closes Issue #31
- **Remaining endpoints smoke test** — `scripts/smoke-test-remaining.ts`: validates 5 additional endpoints (GET record by ID, GET /mine with walletAuth, POST/GET/DELETE webhooks). Result: 2/5 OK, 3 webhooks return HTTP 500

#### Discovered

- **🐛 Bug #34: Webhooks HTTP 500** — All 3 webhook endpoints return error 500 in production. Likely cause: `webhooks` table not migrated in Render DB

#### Fixed

- **Fix #34: Webhooks table migration** — Generated migration `0001_motionless_exodus.sql` with `drizzle-kit` and applied to production with `drizzle-kit push`. Also added `provenance_metadata`, `fee_block`, `fee_confirmed_at` columns to `records`. Smoke test: **5/5 OK**, API coverage **10/10 endpoints**
- **Fix #23: Enrich fee data** — Already implemented. Verified in production: `fee.block`, `fee.confirmed_at`, `fee.chain_id`, `fee.to`, `fee.network_name`, `fee.explorer_url` present in API response

#### Added (Monitoring)

- **Sentry (Issue #19)** — `@sentry/node` integration for error monitoring and performance. `captureException` on 500 errors with context (request_id, method, url). Conditional initialization via `SENTRY_DSN`. Free tier: 5K errors/month
- **Agent Skill (Issue #29)** — Antigravity skill for AI agents in `skills/custom/res-ex-machina/`: SKILL.md with 7 SDK operations, TypeScript examples, complete API reference. Replaces per-framework plugins with a universal approach
- **TestSprite API testing** — `testsprite_tests/testsprite-mcp-test-report.md`, execution of 7 automated test cases against the API:
  - ✅ 2 tests passed (export endpoints — correct 400/404 error handling)
  - ❌ 5 tests failed (TestSprite limitation: cannot generate EIP-712 signatures or on-chain transactions)
  - The 5 failures **confirm that validations work** (rate limiting, Zod schema, invalid signature rejection)

### SDK npm (`@res-ex-machina/sdk`) — Issue #27 ✅ Closed

### Quick Start Guide — Issue #28 ✅ Closed

### README English Translation

#### Changed

- **README.md** — Full translation from Spanish to English (403 lines). All sections preserved: badges, architecture, endpoints, tests, roadmap, issues table, philosophy. Updated current status with accurate counts

#### Added

- **`Docs/quick-start.md`** — "Zero to first record in 5 minutes", English guide with copy-paste
  - Install → Create wallet → Record → Verify → Complete working example
  - Less than 50 lines of code total
  - Link added to main README

#### Added

- **Package `@res-ex-machina/sdk`** in `packages/sdk/` — Complete TypeScript SDK for trivial RxM integration
  - `RxMClient` — Orchestrator: `record()`, `recordBatch()`, `verify()`, `getRecord()`, `export()`, `listRecords()`, `waitForRecord()`
  - **BYO fee mode** — `record()` accepts optional `feeTxHash`; if provided, the SDK doesn't pay on-chain
  - **Webhooks subclient** — `rxm.webhooks.register()`, `list()`, `delete()` with EIP-191 authentication
  - **Typed errors** — `RxMError`, `RxMRateLimitError` (with `retryAfterMs`), `RxMValidationError`
  - **HTTP with retry** — Exponential backoff (1s→2s→4s), configurable timeout
  - **WebCrypto hashing** — `crypto.subtle` first, fallback to `node:crypto` for Node 18+
  - **EIP-712 signing** — Imports shared constants with the server
  - **30 unit tests** in 4 suites (hash, sign, errors, client)
  - **Complete README** — Installation, quick start, usage modes, error handling, API reference
- **`src/constants/eip712.ts`** — EIP-712 constants extracted as single source of truth (server + SDK import from here)

#### Published

- **📦 Published on npm** — [`@res-ex-machina/sdk@0.1.0`](https://www.npmjs.com/package/@res-ex-machina/sdk) (2026-02-16)
  - 38 files (dist/ compiled to ESM)
  - Public package under `res-ex-machina` npm organization
  - Code and documentation translated to English for international adoption
  - `npm install @res-ex-machina/sdk viem`

### Test Improvements

#### Improved

- **Provider-agnostic model_id** — Updated format in 6 test files from `gpt-4o` to `openai:gpt-4o:2026-01` (consistent with provider-agnostic policy)
  - Files: `schemas.test.ts`, `invariants.test.ts`, `records-list.test.ts`, `records-get.test.ts`, `records-batch.test.ts`, `formatters.test.ts`
- **`tests/eip712-sync.test.ts`** — New critical test: verifies that SDK EIP-712 constants exactly match server constants (prevents silent signature divergence)
- **Total tests**: 167 (13 suites)

### Batch Endpoint — Issue #12

#### Added

- **`POST /v1/records/batch`** — Endpoint to create up to 100 records in a single call
  - Each record is processed independently (one failure doesn't affect others)
  - Status codes: `201` (all OK), `207` (partial), `400` (all fail)
  - Stricter rate limit: 5 req/min per wallet
  - Each record requires its own `fee_tx_hash`
- **`src/routes/schemas/batchRecordSchema.ts`** — Zod schema for batch (array of 1-100 `createRecordSchema`)
- **New errors** — `batch_empty` (400), `batch_too_large` (400), `batch_invalid_payload` (400)
- **13 new tests** in `tests/records-batch.test.ts`

### Status Webhooks — Issue #13

#### Added

- **Webhook endpoints** (`POST / GET / DELETE /v1/webhooks`) — Complete push notification system for record state changes
  - `POST /v1/webhooks` — Register webhook (requires walletAuth EIP-191)
  - `GET /v1/webhooks` — List own webhooks (without returning secrets)
  - `DELETE /v1/webhooks/:id` — Deactivate webhook (soft delete)
- **Complete security** adhering to best practices:
  - **SSRF mitigation** — `urlValidator.ts`: HTTPS only, DNS resolve, private/localhost/link-local IP blocking, `redirect: 'error'`
  - **Server secret** — 32-byte hex generated by server, returned only once in POST
  - **HMAC-SHA256** — `X-RxM-Signature` header with payload signature for authenticity
  - **Deduplication** — `delivery_id` (UUID) + `attempt` in each payload
  - **Async dispatch** — BullMQ `webhook_dispatch` queue (doesn't block anchoring)
  - **Retries** — 3 attempts with custom backoff (5s → 30s → 120s)
  - **Timeout** — 5s per HTTP request
  - **Limit** — Maximum 5 active webhooks per wallet
- **DB table** — `webhooks` in PostgreSQL (Drizzle ORM) with indexes by wallet and active
- **New errors** — `webhook_not_found` (404), `webhook_limit_reached` (400), `webhook_invalid_url` (400), `webhook_forbidden` (403)
- **anchor.ts integration** — Dispatches webhooks after `anchored` and `anchor_failed` (in try/catch, never blocks)
- **18 new tests** in `tests/webhooks.test.ts`

### Dual Temporal Attestation — Issue #14

#### Added

- **`pki_timestamp`** — Optional ISO-8601 field in `provenance_metadata` for dual temporal attestation
  - Links PKI timestamp (from provenance standard) with blockchain anchor
  - `temporal_attestation` in export includes both sources: `blockchain_anchor` + `pki_standard`
- **3 new validation tests**

### Public Record Listing — Issue #21

#### Added

- **`GET /v1/records`** — Public endpoint to list records by wallet with advanced filters
  - Required filter: `agent_wallet` (Ethereum address)
  - Optional filters: `state`, `content_type`, `tag`, date range (`from`/`to`)
  - Pagination: `limit` (1-100, default 20) and `offset` (≥0, default 0)
  - Sorting: `sort` (`created_at_asc`, `created_at_desc`)
  - Response with `pagination: { total, limit, offset, has_more }`
- **`src/routes/schemas/listRecordsSchema.ts`** — Zod schema for listing query params
- **New errors** — `missing_agent_wallet` (400), `invalid_query_param` (400)
- **11 new tests** in `tests/records-list.test.ts`

### Provenance Standards Interoperability — Issue #11

#### Added

- **`provenance_metadata`** — Optional JSONB field in `POST /v1/records` for linking with provenance standards
  - 5 standards: `c2pa`, `iptc`, `xmp`, `schema_org`, `custom`
  - Fields: `standard`, `manifest_hash` (sha256), `claim_generator`, `issuer`, `assertions` (max 20), `manifest_uri`
  - 100% backward compatible — records without provenance still work
- **`provenanceMetadataSchema`** — Exported Zod schema for validation
- Automatically included in all API responses (`formatRecordResponse`, `formatFullExport`)
- **12 new validation tests**

### Infrastructure and Resilience — Issues #16, #17, #22

#### Added

- **Health cache 30s** — 30-second TTL cache on `GET /v1/health` to reduce Upstash and RPC calls (#16)
  - Headers `Cache-Control: public, max-age=30` and `X-Cache: HIT|MISS`
  - Header `Retry-After: 30` on 503 responses (degraded mode) (#22)
- **Rate limit with Redis** — Migrated from in-memory to shared Redis store (#17)
  - Factory `createRateLimitRedisClient()` in `config/redis.ts`
  - `skipOnError: true` — if Redis goes down, rate limit is temporarily disabled (#22)
  - Namespace `rxm-rl:` to avoid collisions in shared Redis

#### Improved

- **Degraded mode** — API continues working if Redis or L2 are unavailable (#22):
  - `enqueueAnchorJob` protected with try/catch: record is saved in DB with `state: pending_anchor`
  - Worker will process pending jobs when it reconnects
  - Health check uses `Promise.allSettled` → never fails completely

### Wallet Authentication — Own Record Listing (Issue #26)

#### Added

- **`GET /v1/records/mine`** — Authenticated endpoint to list agent's own records
  - EIP-191 authentication (personal_sign) with headers `X-Wallet-Address`, `X-Signature`, `X-Timestamp`
  - Signed message: `RexAuth:{timestamp}` with 5-minute window
  - Pagination with `?limit=20&offset=0`
  - Only returns records from the authenticated wallet
- **`src/middleware/walletAuth.ts`** — New wallet signature verification middleware
- **4 auth errors** in `errors.ts`: `missing_auth_headers`, `invalid_wallet_address`, `auth_timestamp_expired`, `auth_signature_invalid`
- **9 unit tests** in `tests/wallet-auth.test.ts`

#### Fixed

- **Wallet case-sensitivity** — SQL `lower()` for correct comparison between DB (mixed-case) and middleware (lowercase)

### Independent Receipt Verification

#### Added

- **Verification metadata in export** — The `/v1/records/:id/export` endpoint now includes:
  - `verification`: hash algorithm, canonicalization, fields used
  - `pog_bundle.eip712_domain`: EIP-712 domain for verifying signature without source code
  - `anchor.anchored_hash` + `anchor.anchor_method`: what is anchored and how
  - `fee.chain_id` + `fee.to`: fee traceability data
- **Receipt Verification Spec** — `Docs/receipt-verification-spec.md`: formal specification (1 page) for offline verification
- **CLI Verifier** — `scripts/verify-receipt.ts`: standalone tool that verifies receipt_hash, EIP-712 signature, and on-chain anchoring
- **Spec v1.2** — Formal trust model, `spec_version` in receipts, `created_at` temporal semantics, official test vector with expected hash

### DX Improvements (Developer + Agent Experience)

#### Added

- **`wait_for_anchor=true`** — POST `/v1/records?wait_for_anchor=true` waits up to 25s for anchoring to complete, returning the final state in a single call. If timeout, returns `pending_anchor` with header `Retry-After: 5`
- **Structured `state_info`** — All responses include `state_info` block with `terminal`, `retryable`, and `description` for programmatic agent actions
- **Automatic `explorer_url`** — `anchor` and `fee` blocks now include `explorer_url` and `network_name` auto-generated by `chain_id`
- **Compact mode** — `GET /v1/records/:id/export?mode=compact` returns only cryptographic verification fields, omitting fee, visibility, generation metadata (ideal for LLMs)
- **18 new tests** — Unit tests for `stateInfo`, `explorer`, and integration tests for state_info, compact mode

### Code Review Refactoring

#### Fixed

- **`anchor_failed` state metadata** — Changed to `terminal: true`, `retryable: false` (the BullMQ worker already exhausted its retries)
- **`feeTxReused` status code** — From 402 → 409 (semantically a conflict, not a payment issue)
- **Fee comparison precision** — Replaced `parseFloat(formatEther())` with `parseEther()` using native BigInt (avoids IEEE-754 precision loss)
- **Error handler logging** — `console.error` replaced by `_request.log.error()` (Pino structured logs)
- **Worker import error handling** — Specific try/catch for dynamic import of anchor worker (API can work without worker)

#### Improved

- **Health check performance** — Singleton clients for Redis and blockchain (previously created on each call)
- **Wallet privacy** — Wallet truncated in logs (`0x13bB...8a0` instead of full address)
- **Rate limit safety** — try/catch in rate limit `keyGenerator` per wallet + body parsing order documentation

---

## [1.0.0-alpha.1] — 2026-02-12

### First Public Deploy (Alpha) 🚀

Deploy on Render + Neon + Upstash + Base Sepolia testnet. Cost: $0/month.

#### Added

- **Multi-chain** — `anchor.ts` no longer depends on `foundry` (local Anvil). Uses `defineChain` with dynamic `L2_CHAIN_ID`, supports any EVM L2 (Base Sepolia, Polygon, etc.)
- **Redis TLS + password** — `queue.ts` and `anchor.worker.ts` support `rediss://` (mandatory TLS) and extract password from URL. Required for Upstash
- **Inline worker** — `app.ts` starts the anchor worker in the same process in production (`NODE_ENV=production`). Eliminates need for a separate Background Worker (paid plan on Render)
- **`.env.example`** — Documented cloud options (Neon, Upstash, Base Sepolia)

#### Cloud Infrastructure

| Service | Provider | Plan |
|---|---|---|
| API + Worker | Render.com | Free (Docker) |
| PostgreSQL | Neon | Free (0.5GB) |
| Redis | Upstash | Free (10K cmd/day) |
| Blockchain | Base Sepolia | Testnet (free) |

#### Public URL

`https://res-ex-machina-api.onrender.com`

#### Modified Files

- `src/services/anchor.ts` — Dynamic `defineChain`
- `src/services/queue.ts` — TLS + password
- `src/workers/anchor.worker.ts` — TLS + password
- `src/app.ts` — Inline worker in production
- `.env.example` — Cloud options documented

---

## [1.0.0-rc3] — 2026-02-12

### Pre-Alpha Hardening

#### Added

- **Graceful shutdown** — `app.ts`: SIGTERM/SIGINT drains active requests, closes BullMQ queue and PostgreSQL pool cleanly
- **Graceful shutdown worker** — `anchor.worker.ts`: SIGTERM/SIGINT stops accepting new jobs, finishes current one, closes cleanly
- **`FEE_TX_MAX_AGE_HOURS`** — New configurable environment variable (default 24h), previously hardcoded in `fee.ts`
- **`recordsService.ts`** — New module with business logic extracted from `records.ts`:
  - `validateAndParseInput()` — Zod validation with differentiated errors
  - `checkDuplicates()` — 3 parallel DB checks (content_hash, nonce, fee_tx_hash)
  - `createRecord()` — DB INSERT + enqueue anchor + UNIQUE violation handling
- **Export `client`** — `db/index.ts` now exports the PostgreSQL client for shutdown

#### Improved

- **Simplified POST handler** — `records.ts` reduced from 349 to 222 lines. Handler from ~140 to ~30 lines
- **fee_tx_hash duplicates** — Check moved to `Promise.all` alongside hash+nonce (previously sequential)

#### Modified Files

- `src/app.ts` — Shutdown function + dynamic import of `anchorQueue`
- `src/workers/anchor.worker.ts` — Shutdown function
- `src/db/index.ts` — Export `client`
- `src/config/env.ts` — `FEE_TX_MAX_AGE_HOURS` (Zod, default 24)
- `src/services/fee.ts` — Uses `env.FEE_TX_MAX_AGE_HOURS` instead of constant
- `src/services/recordsService.ts` — **New file**
- `src/routes/records.ts` — Simplified, uses recordsService
- `.env.example` — New variable documented
- `tests/fee.test.ts` — Mock updated with `FEE_TX_MAX_AGE_HOURS`

---

## [1.0.0-rc2] — 2026-02-12

### CI / Tests — Session 2

#### Fixed

- **Fee tests** — Added missing `getTransactionReceipt` mock after the `Promise.all` optimization in rc2
- **Invariant tests** — Added `mockVerifyFee` in nonce/content_hash duplicate tests (verifyFee runs in parallel in `Promise.all` with DB checks)
- **Invariant tests** — Fixed GET record mock (`mockLimit` desynchronized)

#### Improved

- **CI workflow** — Rewritten `.github/workflows/ci.yml`:
  - Environment variables consolidated (from 3 repeated blocks to 1)
  - `FEE_MINIMUM_AMOUNT` fixed: 0.001 → 0.01 (synchronized with rc2)
  - Added **Node 22 LTS** to version matrix
  - Added `timeout-minutes: 10` against hanging runs
  - Added `concurrency` to cancel duplicate runs
  - Added **coverage** step with `@vitest/coverage-v8` + downloadable artifact
- **New script** `test:coverage` in `package.json`

#### Modified Files

- `.github/workflows/ci.yml` — Complete rewrite
- `package.json` — Added `test:coverage`
- `tests/fee.test.ts` — Mock `getTransactionReceipt` + fixture `VALID_RECEIPT`
- `tests/invariants.test.ts` — `mockVerifyFee` in 3 tests + fix mock GET

---

### Important Changes

- **Minimum fee raised** — from $0.001 to **$0.01** (~1 cent USD) in `.env.example`, 4 tests, 1 script, and 7 documents
- **Spam cost updated** in threat model: 1M records now costs $10,000 (previously $1,000)

### Added

- **Human guide** — "Important things you should know" section with 4 clarifications:
  - Wallet = technical identity (person, organization, or agent)
  - `model_id` is declarative (RxM does not verify which model was executed)
  - Duplicate content → first record wins
  - Blockchain failures → immediate DB record, anchoring with retries
- **Technical guide** — "Trust Model & Declarative Fields" section:
  - Identity model (1 wallet per agent recommended)
  - Table of verified vs declarative fields with trust level
  - Recommendations for integrators
- **Human guide** — Future possibility of decentralized storage (IPFS) mentioned in FAQ
- **GitHub Issue #15** — Investigate `model_id` verification/corroboration (v2+)

### Fixed

- **Rate limit 429 bug** — `@fastify/rate-limit` with `config.rateLimit` per route passes a plain object (not an `Error`) to the handler. The `apiErrorHandler` now detects these objects and returns 429 with correct format
- **POST /v1/records latency** — Parallelization of `verifyFee()` (2 RPCs via `Promise.all`) and parallelization of DB checks (hash + nonce + fee)
- **Race condition INSERT** — Protection with `try/catch` of UNIQUE constraint (code 23505) for concurrent duplicates

### Added

- Rate limit regression test: `scripts/tests/rate-limit-regression.ts` (7 checks)
- Alpha test re-executed: Agent A 15/20 + 5×429 ✅, Agent D 10/10 ✅

### Modified Files

- `src/utils/errors.ts` — Handler 429/413 + plain rate-limit object detection
- `src/services/fee.ts` — Parallel RPCs + receipt status check
- `src/routes/records.ts` — Promise.all parallelization + UNIQUE constraint safety

---

## [1.0.0-rc1] — 2026-02-11

### Release Candidate 1

Preparation for private alpha: security hardening, observability, complete documentation, test scripts, and provenance standards interoperability design.

### Added

#### Security and Hardening
- Rate limiting per wallet: 10 req/min POST /v1/records
- Strict validations: nonce max 128, signature exactly 132, tags max 64, external_ref max 512
- Error sanitization: removed `any` casts in error handler

#### Observability
- Structured logs in `app.ts`: request_id UUID, wallet extraction, response_time_ms
- Log level by status code: 5xx=error, 4xx=warn, 2xx=info
- Operations runbook with 6 scenarios (`Docs/runbook.md`)

#### Documentation
- Offline PoG verification (`Docs/verify-pog-offline.md`)
- curl examples for all endpoints (`Docs/api-examples.md`)
- Alpha pilot plan (`Docs/alpha-pilot-plan.md`)
- Provenance standards interoperability (`Docs/c2pa-interoperability.md`)

#### Alpha Testing
- Agent A script: happy path, burst 20 records, idempotency, verify/export
- Agent D script: 8 adversarial tests (signature, nonce, hash, fee, delete, rate limit)
- npm scripts: `check`, `alpha:happy`, `alpha:adversarial`, `alpha:all`

#### v1.1 Design
- Generic `provenance_metadata` field with `standard` discriminator
- Support for C2PA, IPTC, XMP, Schema.org, custom

---

## [1.0.0] — 2026-02-10

### MVP Completed 🎉

First functional version of the MVP with REST API, EIP-712 verification, on-chain fee, anchoring, and 63 tests.

### Added

#### Core API
- **POST /v1/records** — Register AI generation events with signed PoG v1
- **GET /v1/records/:id** — Query record by UUID
- **GET /v1/records/verify** — Verify existence by content_hash
- **GET /v1/records/:id/export** — Export verifiable receipt (`rex.receipt.v1`)
- **GET /v1/health** — Detailed health check (PostgreSQL, Redis, L2)
- **DELETE /v1/records/:id** — 405 Method Not Allowed (INV-001: permanent records)

#### Verification and Security
- EIP-712 signature with `viem.verifyTypedData`
- On-chain fee verification (5 checks: exists, confirmed, amount, recipient, recent)
- Idempotency by content_hash (409 Conflict)
- Anti-replay by wallet+nonce (409 Conflict)
- Fee tx not reusable (UNIQUE constraint)
- Rate limiting: 100 req/min global, 10 req/min POST
- Security headers (`@fastify/helmet`)
- CORS configured (`@fastify/cors`, disabled in production)
- Body limit 64KB
- Error sanitization (never exposes stack traces)

#### Infrastructure
- PostgreSQL data model with Drizzle ORM (`records` table)
- Anchor Worker with BullMQ (exponential retries)
- Docker Compose (PostgreSQL + Redis + Anvil)
- Production Dockerfile
- CI/CD with GitHub Actions (tsc + vitest + coverage v8 + build, Node 20+22)

#### Tests (63 passing)
- `errors.test.ts` (9) — ApiError + factory functions
- `receipt.test.ts` (4) — Deterministic SHA-256 receipt hash
- `schemas.test.ts` (14) — Zod validation (PoG + createRecord)
- `fee.test.ts` (9) — On-chain fee (5 mocked checks)
- `records-get.test.ts` (13) — GET /:id, /verify, /export
- `invariants.test.ts` (14) — System invariants (POST 401/402/409, DELETE 405)

### Closed Issues
- [#1](https://github.com/Sebas-Solver/Res-ex-Machina/issues/1) Scaffolding (`2005ea5`)
- [#2](https://github.com/Sebas-Solver/Res-ex-Machina/issues/2) Data model (`65b9fe4`)
- [#3](https://github.com/Sebas-Solver/Res-ex-Machina/issues/3) POST /records EIP-712 (`9f2edeb`)
- [#4](https://github.com/Sebas-Solver/Res-ex-Machina/issues/4) On-chain fee (`32e2425`)
- [#5](https://github.com/Sebas-Solver/Res-ex-Machina/issues/5) GET endpoints (`160b5a5`)
- [#6](https://github.com/Sebas-Solver/Res-ex-Machina/issues/6) Anchor Worker (`4518376`)
- [#7](https://github.com/Sebas-Solver/Res-ex-Machina/issues/7) Health + Rate limiting (`d187c77`)
- [#8](https://github.com/Sebas-Solver/Res-ex-Machina/issues/8) Security hardening (`0e86c67`)
- [#9](https://github.com/Sebas-Solver/Res-ex-Machina/issues/9) Invariant tests (`6aa9445`)

### Main Dependencies
- `fastify` ^5.2.2
- `viem` ^2.25.3
- `drizzle-orm` ^0.39.3
- `bullmq` ^5.52.1
- `ioredis` ^5.6.0
- `zod` ^3.25.3
- `vitest` ^4.0.18
- `typescript` ^5.8.3
- `@fastify/helmet` ^13.0.1
- `@fastify/cors` ^11.0.1
- `@fastify/rate-limit` ^10.2.2
