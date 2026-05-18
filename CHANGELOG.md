# Changelog

All notable changes to this project are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [v1.0.0-alpha.3] — 2026-05-15 — P1-2 SDK Read-Only Mode

### Added

- **`readOnly: true` client mode** — `RxMClient` now supports wallet-less instantiation for verifiers and auditors:
  ```typescript
  const rxm = new RxMClient({ apiUrl: 'https://...', readOnly: true });
  ```
- **Discriminated union (`RxMClientOptions`)** — TypeScript enforces that `readOnly: true` rejects `account`, `rpcUrl`, `feeReceiverAddress` at compile time
- **`RxMReadOnlyError`** (code: `read_only_client`) — New error class thrown by write operations: `record()`, `recordHash()`, `recordBatch()`, `webhooks.register()`, `webhooks.list()`, `webhooks.delete()`
- **`agentWallet` parameter for `listRecords()`** — Required in read-only mode, optional in writable mode (defaults to `this.account.address`)
- **Runtime constructor validation** — Rejects ambiguous configs even from plain JavaScript:
  - `readOnly: true` + wallet params → `RxMValidationError` ("Ambiguous configuration")
  - `readOnly: false` without wallet params → `RxMValidationError` ("Missing writable configuration")
- **24 new tests** in `tests/readonly.test.ts` — Constructor, guards, read ops, listRecords, writable regression

### Exports

- `RxMReadOnlyError`, `RxMWritableClientOptions`, `RxMReadOnlyClientOptions` added to public API

---

## [v1.0.0-alpha.2-p0] — 2026-05-15 — P0 Security Remediation

### P0-1: Rate Limiter Degradation Policy — H-01 Remediation

#### Fixed (Critical)

- **CRITICAL: `skipOnError: true` eliminated** — Rate limiter no longer silently disables when Redis fails. Replaced with explicit degradation policy:
  - **GET endpoints**: Conservative in-memory fallback (30 req/min per IP per instance)
  - **POST/write endpoints**: `503 Service Unavailable` in production (`RATE_LIMIT_WRITE_ON_REDIS_DOWN=503`)
  - Configurable `local_fallback` mode for development/testnet (5 req/min strict limit)
- **Redis health tracking** — `redisHealthy` flag with `connect`/`error` event listeners, logged transitions
- **`/health` exempt** — Health endpoint excluded from aggressive rate limiting (always responds)
- **Error response** — New `service_degraded` error code (503) with `retry_after` hint

#### Added

- **`RATE_LIMIT_WRITE_ON_REDIS_DOWN`** — Controls write endpoint behavior when Redis is down (`503` or `local_fallback`)
- **`RATE_LIMIT_READ_ON_REDIS_DOWN`** — Controls read endpoint behavior when Redis is down (`local_fallback` default)
- **22 unit tests** — Full CTO policy matrix (4 scenarios + 10 endpoint combinations)

### P0-2: Audit Trail for `confirmation_mode` — Safe Operations

#### Added

- **`audit_events` table** (SQLite) — Persistent, tamper-evident log for all confirmation mode changes:
  - Fields: `event_id`, `event_type`, `actor_wallet`, `actor_type` (agent|operator|system), `previous_value`, `new_value`, `reason` (NOT NULL), `request_id`, `created_at`
- **`MCP_ALLOW_AUTO_MODE`** — New env var (default `false` ALWAYS). Auto mode requires explicit opt-in
- **Mandatory reason** — Switching to `auto` mode requires non-empty `reason` string
- **Restart safe default (Option A)** — Process restart always resets to `require` mode with `process_restart_safe_default` audit event
- **`setConfirmationMode()` returns metadata** — `{ previousMode, allowed, reason }` for audit trail integration
- **11 unit tests** — Auto mode rejection, reason validation, config reset, CRUD, filtering

### CI: Pipeline Restructure (CTO Option A)

#### Changed

- **CI split into two jobs** (CTO directive):
  - **Job `test` (REQUIRED)** — All checks that must pass for merge, including MCP Server Jest tests
  - **Job `mcp-typecheck` (NON-BLOCKING)** — MCP Server `tsc --noEmit`, tracked as P1 debt in [Issue #43](https://github.com/Sebas-Solver/Res-ex-Machina/issues/43)
- **MCP Server Jest tests (62 tests) added to required CI** — Tests must pass in CI, not just locally
- **Root cause**: Type graph complexity from `viem` + import structure makes typecheck inviable with current configuration

#### Note

All required CI steps pass green: `npm audit`, TypeScript (main), ESLint, 191 vitest tests, coverage, production build, MCP Server install + 62 Jest tests.

---

## [Unreleased] — x402 Protocol Integration (Agent Economy)

### x402 Native Payment Support — Epic #42

Implements native HTTP `402 Payment Required` support for machine-to-machine (M2M) payments, following the [x402 protocol standard](https://x402.org). Agents can now pay for registration automatically without manual fee transactions.

> **Status:** Code complete, TypeScript compilation clean (0 errors). Pending: E2E test on Base Sepolia testnet. Feature is **disabled by default** (`X402_ENABLED=false`).

#### Added

- **`X402_ENABLED` flag** — New environment variable (default `false`) to enable x402 payment mode. Legacy fee flow (`fee_tx_hash`) remains the default and is unaffected
- **x402 verifier service** — Validates payment signatures and settles payments via external x402 facilitator
- **Unified payment abstraction** — `PaymentEvidence` type discriminating between `legacy_eth` and `x402_usdc` payment methods with `payment_attempts` lifecycle
- **SDK x402 mode** — `RxMClient` now accepts `paymentMode: 'x402'`. On 402 response: reads `PaymentRequired`, signs payment with agent wallet, retries with payment headers
- **MCP Server auto-pay** — `rxm_record` tool transparently handles 402 responses via SDK x402 mode

#### Changed

- **`POST /v1/records`** — Now checks for x402 headers before falling back to `fee_tx_hash`. Returns `402 Payment Required` with standard headers if x402 is enabled and no payment provided
- **`POST /v1/records/batch`** — Same x402 awareness added to batch endpoint
- **Payment flow invariant preserved** — Record is only inserted *after* settlement is confirmed by facilitator

---

## [Unreleased] — Open-Core & Security Hardening

### Open-Core Sanitization

Aligned public repository with "Open Protocol, Closed Managed Network" strategy per external advisor review.

#### Changed

- **Production deployment section** — Removed self-hosted instructions from developer guide. Replaced with "Contact RxM team" redirect
- **Fee roadmap** — Removed pricing strategy details from `fee-flow-v1.md`. Kept as "details TBD"
- **Broken links** — Fixed references to files moved to private repo
- **Environment variables** — Moved `.env.production.example` to private repository and replaced with a secure stub

#### Security

- **Anvil key removed** — Removed Anvil account #0 private key from all public files. Replaced with placeholder + link to Foundry docs

#### License

- **Open-Core model clarified** — Protocol, SDK, and verification tools are Apache 2.0. Managed service infrastructure is proprietary
- **CONTRIBUTING.md** — Full contributor guide with Code of Conduct, setup, conventions, and PR process

### 007 Security Audit — Complete ✅ (14/14 resolved)

Full 6-phase security audit (STRIDE threat model, Red/Blue Team, technical checklist).

#### Fixed (High)

- **H-01: CI private key exposure** — Moved `ANCHOR_WALLET_PRIVATE_KEY` from plaintext to GitHub Secrets
- **H-02: Admin key rotation undocumented** — Created formal rotation procedure with key lifecycle and rollback steps

#### Fixed (Medium)

- **M-01: Timing-unsafe admin key comparison** — Now uses `crypto.timingSafeEqual()` instead of `===`
- **M-02: Docker container runs as root** — Added `USER node` directive
- **M-03: Redis without password** — Added `requirepass` to Redis in dev environment
- **M-04: SSRF DNS rebinding (TOCTOU)** — Re-validates DNS at fetch time, blocking DNS rebinding attacks
- **M-05: CSP disabled globally** — Helmet CSP enabled globally with strict directives

#### Fixed (Low)

- **L-01: No alerts for `anchor_failed`** — Sentry integration for operator alerting
- **L-02: Admin dashboard without CSP** — Resolved by M-05 (global CSP)
- **L-03: Health endpoint info leak** — Two-tier response: public minimal, admin detailed
- **L-04: Dev dependencies with moderate vulns** — Accepted risk: `esbuild` via `drizzle-kit` (dev-only)
- **L-05: 14 outdated dependencies** — Bulk update applied
- **L-06: Admin audit trail insufficient** — Structured audit logging with IP, key fingerprint, request_id
- **L-07: Dead `_contentHash` parameter** — Removed unused argument from all call sites

#### Audit Verdict

> **✅ APPROVED — AUDIT COMPLETE**. All 14 findings resolved. No open vulnerabilities.

### Additional Security Hardening

- **PAT in git remote** — Removed GitHub Personal Access Token from `.git/config`. Configured credential helper
- **Hardcoded private key** — Replaced with placeholder in `.env.example`
- **Hardcoded DB password** — Parameterized with environment variable pattern
- **Email exposure** — Replaced personal email in README with GitHub Issues/Profile links
- **Horizontal scaling** — API and Worker separated into independent services. Production details in private repository

### Public Status Page — Issue #32 ✅

- **`docs/index.html`** — Live health dashboard hosted on GitHub Pages
  - Real-time monitoring of API, Database, Redis, and Blockchain L2
  - Auto-refresh, dark theme, zero dependencies
  - Machine-readable: JSON-LD, alternate JSON endpoint, noscript fallback

### Public Narrative — Issue #33 ✅

- **`Docs/narrative.md`** — Complete public pitch document
  - Elevator pitch, "Why now?" section, competitive positioning, target segments

### CORS & Helmet Fix

- CORS enabled for GitHub Pages status page
- `CORS_ALLOWED_ORIGINS` env var for custom origins
- Helmet `crossOriginResourcePolicy` set to `cross-origin`

---

## [Unreleased] — Production Readiness

### Code Quality & Reliability

#### Fixed

- **CRITICAL: anchorRecord idempotency** — Prevents duplicate on-chain txs when BullMQ re-executes stalled/retried jobs
- **HIGH: SSRF IPv6 bypass** — DNS resolution now checks both IPv4 (A) and IPv6 (AAAA) records
- **MEDIUM: Structured logger** — Replaced all `console.log/warn/error` with structured JSON logging (Pino)
- **HIGH: Broken test chain** — Fixed import chain that crashed tests lacking env vars. **Result: 169/169 tests passing**

#### Changed

- **Batch parallelization** — `POST /v1/records/batch` now uses `Promise.allSettled` for concurrent processing
- **CI pipeline** — Added ESLint linting step

### Security Hardening (Threat Model)

- **D-04: pog_bundle size limit** — Zod `refine` limiting serialized size to 32KB max
- **D-04: Batch body limit** — `bodyLimit: 256KB` for batch endpoint (global stays at 64KB)
- **D-01: BullMQ backpressure** — Reduced queue retention, added `maxStalledCount: 2`
- **A06: npm audit in CI** — Added `npm audit --audit-level=high` to CI pipeline
- **2 new tests** for pog_bundle size validation

### Worker Scalability

- **`START_INLINE_WORKER` env var** — Run BullMQ anchor worker as a separate process for horizontal scaling

### Documentation Overhaul

- Fixed ~10 broken links in README (old flat structure → new subfolder structure)
- Updated faucet reference to Optimism Superchain Faucet
- Added MetaMask wallet creation as recommended option
- Dependency updates to latest compatible versions

---

## [Unreleased] — Features for alpha.2+

### Security Audit and Testing

- **Semgrep SAST scan** — Static security analysis: **0 vulnerabilities detected**
- **E2E Smoke test** — Validates published SDK against production API (6/6 steps)
- **Remaining endpoints smoke test** — 5 additional endpoints validated

#### Discovered & Fixed

- **Bug #34: Webhooks HTTP 500** — Table not migrated in production DB. Generated migration and applied. Smoke test: **10/10 endpoints OK**
- **Fix #23: Enrich fee data** — Verified: `fee.block`, `fee.confirmed_at`, `fee.chain_id`, `fee.network_name`, `fee.explorer_url` present in API responses

### Monitoring

- **Sentry integration (Issue #19)** — Error monitoring and performance. `captureException` on 500 errors with context
- **Agent Skill (Issue #29)** — Antigravity skill for AI agents: 7 SDK operations, TypeScript examples, API reference

### SDK npm (`@res-ex-machina/sdk`) — Issue #27 ✅

- **Package `@res-ex-machina/sdk`** in `packages/sdk/` — Complete TypeScript SDK
  - `RxMClient` — `record()`, `recordBatch()`, `verify()`, `getRecord()`, `export()`, `listRecords()`, `waitForRecord()`
  - **BYO fee mode** — `record()` accepts optional `feeTxHash`
  - **Webhooks subclient** — `register()`, `list()`, `delete()` with EIP-191 authentication
  - **Typed errors** — `RxMError`, `RxMRateLimitError` (with `retryAfterMs`), `RxMValidationError`
  - **HTTP with retry** — Exponential backoff, configurable timeout
  - **WebCrypto hashing** — `crypto.subtle` first, fallback to `node:crypto`
  - **EIP-712 signing** — Imports shared constants with the server
  - **30 unit tests** across 4 suites
- **Published on npm** — [`@res-ex-machina/sdk@0.1.0`](https://www.npmjs.com/package/@res-ex-machina/sdk) (2026-02-16)

### Quick Start Guide — Issue #28 ✅

- **`Docs/quick-start.md`** — "Zero to first record in 5 minutes", English guide with copy-paste examples

### README English Translation

- Full translation from Spanish to English (403 lines)

### Test Improvements

- **Provider-agnostic model_id** — Updated format from `gpt-4o` to `openai:gpt-4o:2026-01`
- **EIP-712 sync test** — Verifies SDK and server EIP-712 constants match (prevents silent signature divergence)
- **Total tests**: 167 (13 suites)

### Batch Endpoint — Issue #12

- **`POST /v1/records/batch`** — Create up to 100 records in a single call
  - Independent processing (one failure doesn't affect others)
  - Status codes: `201` (all OK), `207` (partial), `400` (all fail)
  - Stricter rate limit: 5 req/min per wallet
- **New errors** — `batch_empty`, `batch_too_large`, `batch_invalid_payload`
- **13 new tests**

### Status Webhooks — Issue #13

- **Webhook endpoints** (`POST / GET / DELETE /v1/webhooks`) — Push notification system for record state changes
  - **SSRF mitigation** — HTTPS only, DNS resolve, private IP blocking
  - **HMAC-SHA256** — `X-RxM-Signature` header for authenticity
  - **Deduplication** — `delivery_id` + `attempt` in each payload
  - **Async dispatch** — BullMQ queue (doesn't block anchoring)
  - **Retries** — 3 attempts with backoff (5s → 30s → 120s)
  - **Limit** — Maximum 5 active webhooks per wallet
- **18 new tests**

### Dual Temporal Attestation — Issue #14

- **`pki_timestamp`** — Optional ISO-8601 field for dual temporal attestation (PKI + blockchain)

### Public Record Listing — Issue #21

- **`GET /v1/records`** — Public endpoint to list records by wallet with advanced filters
  - Required filter: `agent_wallet` (Ethereum address)
  - Optional: `state`, `content_type`, `tag`, date range, sorting
  - Pagination with `total`, `limit`, `offset`, `has_more`
- **11 new tests**

### Provenance Standards Interoperability — Issue #11

- **`provenance_metadata`** — Optional JSONB field for linking with provenance standards
  - Supports: `c2pa`, `iptc`, `xmp`, `schema_org`, `custom`
  - 100% backward compatible
- **12 new validation tests**

### Infrastructure and Resilience — Issues #16, #17, #22

- **Health cache 30s** — TTL cache on `GET /v1/health` to reduce external calls
- **Rate limit with Redis** — Migrated from in-memory to shared Redis store
  - **Degraded mode** — API continues working if Redis or L2 are unavailable

### Wallet Authentication — Issue #26

- **`GET /v1/records/mine`** — Authenticated endpoint to list agent's own records
  - EIP-191 authentication with 5-minute signature window
- **9 unit tests**

### Independent Receipt Verification

- **Verification metadata in export** — Hash algorithm, canonicalization, EIP-712 domain, anchor hash
- **Receipt Verification Spec** — Formal specification for offline verification
- **CLI Verifier** — Standalone tool for receipt verification
- **Spec v1.2** — Formal trust model, `spec_version` in receipts, official test vector

### DX Improvements

- **`wait_for_anchor=true`** — POST waits up to 25s for anchoring, returning final state in a single call
- **Structured `state_info`** — `terminal`, `retryable`, `description` for programmatic agent actions
- **Automatic `explorer_url`** — Auto-generated from `chain_id`
- **Compact mode** — `GET /v1/records/:id/export?mode=compact` for LLMs
- **18 new tests**

### Code Quality

- **`anchor_failed` state metadata** — Corrected to `terminal: true`, `retryable: false`
- **`feeTxReused` status code** — From 402 → 409 (semantically a conflict)
- **Fee comparison precision** — Native BigInt via `parseEther()` (avoids IEEE-754 loss)
- **Health check performance** — Singleton clients for Redis and blockchain
- **Wallet privacy** — Wallet truncated in logs

---

## [1.0.0-alpha.1] — 2026-02-12

### First Public Deploy (Alpha) 🚀

First public deployment on Base Sepolia testnet.

#### Added

- **Multi-chain support** — Dynamic `defineChain` with `L2_CHAIN_ID`, supports any EVM L2
- **Redis TLS + password** — Support for `rediss://` (mandatory TLS)
- **Inline worker** — Anchor worker in the same process (eliminates separate background process)

---

## [1.0.0-rc3] — 2026-02-12

### Pre-Alpha Hardening

#### Added

- **Graceful shutdown** — SIGTERM/SIGINT drains active requests, closes BullMQ queue and PostgreSQL pool
- **`FEE_TX_MAX_AGE_HOURS`** — Configurable environment variable (default 24h)
- **`recordsService.ts`** — Business logic extracted from route handler:
  - `validateAndParseInput()`, `checkDuplicates()`, `createRecord()`

#### Improved

- **Simplified POST handler** — Route reduced from 349 to 222 lines

---

## [1.0.0-rc2] — 2026-02-12

### CI / Tests

#### Fixed

- **Fee and invariant tests** — Fixed mocks after parallelization refactoring

#### Improved

- **CI workflow** — Environment variables consolidated, Node 22 LTS added, timeout and concurrency controls, coverage step added

### Important Changes

- **Minimum fee raised** — from $0.001 to **$0.01** (~1 cent USD)

### Added

- **Trust model documentation** — Verified vs declarative fields table, integrator recommendations
- **Human guide** — Wallet identity model, `model_id` declarativeness, duplicate handling, failure resilience

### Fixed

- **Rate limit 429 bug** — Correct handling of rate limit objects in error handler
- **POST /v1/records latency** — Parallelized fee verification and DB checks
- **Race condition INSERT** — UNIQUE constraint protection for concurrent duplicates

---

## [1.0.0-rc1] — 2026-02-11

### Release Candidate 1

Preparation for private alpha: security hardening, observability, complete documentation, and test scripts.

#### Security and Hardening

- Rate limiting per wallet: 10 req/min POST /v1/records
- Strict validations: nonce max 128, signature exactly 132, tags max 64, external_ref max 512
- Error sanitization: removed `any` casts in error handler

#### Observability

- Structured logs: request_id UUID, wallet extraction, response_time_ms
- Log level by status code: 5xx=error, 4xx=warn, 2xx=info

#### Documentation

- Offline PoG verification guide
- curl examples for all endpoints
- Alpha pilot plan
- Provenance standards interoperability design

#### Alpha Testing

- Agent A script: happy path, burst 20 records, idempotency
- Agent D script: 8 adversarial tests (signature, nonce, hash, fee, delete, rate limit)

---

## [1.0.0] — 2026-02-10

### MVP Completed 🎉

First functional version of the MVP with REST API, EIP-712 verification, on-chain fee, anchoring, and 63 tests.

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
- Security headers, CORS, body limit 64KB, error sanitization

#### Infrastructure

- PostgreSQL data model with Drizzle ORM
- Anchor Worker with BullMQ (exponential retries)
- Docker Compose for development
- CI/CD with GitHub Actions (tsc + vitest + coverage + build, Node 20+22)

#### Tests (63 passing)

- `errors.test.ts` (9) — ApiError + factory functions
- `receipt.test.ts` (4) — Deterministic SHA-256 receipt hash
- `schemas.test.ts` (14) — Zod validation
- `fee.test.ts` (9) — On-chain fee verification
- `records-get.test.ts` (13) — GET endpoints
- `invariants.test.ts` (14) — System invariants

### Closed Issues

- [#1](https://github.com/Sebas-Solver/Res-ex-Machina/issues/1) Scaffolding
- [#2](https://github.com/Sebas-Solver/Res-ex-Machina/issues/2) Data model
- [#3](https://github.com/Sebas-Solver/Res-ex-Machina/issues/3) POST /records EIP-712
- [#4](https://github.com/Sebas-Solver/Res-ex-Machina/issues/4) On-chain fee
- [#5](https://github.com/Sebas-Solver/Res-ex-Machina/issues/5) GET endpoints
- [#6](https://github.com/Sebas-Solver/Res-ex-Machina/issues/6) Anchor Worker
- [#7](https://github.com/Sebas-Solver/Res-ex-Machina/issues/7) Health + Rate limiting
- [#8](https://github.com/Sebas-Solver/Res-ex-Machina/issues/8) Security hardening
- [#9](https://github.com/Sebas-Solver/Res-ex-Machina/issues/9) Invariant tests

### Main Dependencies

- `fastify` ^5.2.2
- `viem` ^2.25.3
- `drizzle-orm` ^0.39.3
- `bullmq` ^5.52.1
- `ioredis` ^5.6.0
- `zod` ^3.25.3
- `vitest` ^4.0.18
- `typescript` ^5.8.3
