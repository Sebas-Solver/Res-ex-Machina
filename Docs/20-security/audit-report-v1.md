# Audit Report — Res ex Machina v1.0.0-rc3

**Date:** 2026-02-12  
**Auditor:** Antigravity (skills: `production-code-audit`, `api-security-best-practices`, `blockchain-developer`)  
**Scope:** Complete review of source code and project documentation

---

## 1. General Status

| Area | Result | Note |
|------|-----------|------|
| **API Security** | ✅ Excellent | Helmet, CORS, rate limiting, error sanitization, body limits |
| **Blockchain** | ✅ Good | Fee verification with 5 checks, parallel RPCs, tx recency check |
| **Code Quality** | ✅ Good | Strict TypeScript, Zod validation, factory errors, well-typed schemas |
| **Testing** | ✅ Good | 63 unit tests + v8 coverage + 2 alpha agents (happy + adversarial) + regression test |
| **Documentation** | ✅ Up to date | Updated with rc2 — error catalog, runbook, alpha report, changelog |
| **CI/CD** | ✅ Improved | GitHub Actions: Node 20+22, timeout, concurrency, coverage, consolidated env |
| **Database** | ✅ Solid | CHECK constraints, UNIQUE constraints, correct indexes |

> **Global Verdict:** The project is in very good condition for a private alpha v1.0. No critical vulnerabilities were found.

---

## 2. Security — Findings

### ✅ What is well done

1. **Error sanitization** — Stack traces or internal details are never exposed to the client (`apiErrorHandler` in `errors.ts`)
2. **Helmet** — Active security headers (XSS, clickjacking, etc.)
3. **CORS** — Disabled in production (`origin: false`)
4. **Body limit** — 64KB max, validated in Fastify config
5. **Rate limiting** — Global 100 req/min, 10 req/min per wallet on POST
6. **Env validation** — All variables validated with Zod on startup (`env.ts`). If any are missing, app DOES NOT start
7. **Fee anti-reuse** — UNIQUE constraint on `fee_tx_hash` + check in code
8. **Nonce anti-replay** — Compound UNIQUE on `(agent_wallet, nonce)`

### ⚠️ Minor observations (not critical for alpha)

| # | Observation | Risk | Recommendation | Priority |
|---|-------------|--------|---------------|-----------|
| S-1 | `ANCHOR_WALLET_PRIVATE_KEY` in `.env` | Low (dev only) | Use KMS (AWS/GCP) or Vault in production | v1.1 |
| S-2 | CORS `origin: true` in development allows any origin | None (dev only) | Already `false` in production ✅ | — |
| S-3 | Worker uses `console.log/error` instead of Fastify logger | Low | Migrate to shared pino logger for uniform logs | v1.1 |
| S-4 | No API key / auth for GET endpoints | Design (public data) | Correct for v1 (public data by design). Consider API keys for differential rate limits in v1.1 | v1.1 |

---

## 3. Blockchain — Findings

### ✅ What is well done

1. **Fee verification** — 5 complete checks: tx exists, confirmed (status=success), amount ≥ minimum, correct recipient, configurable recency (`FEE_TX_MAX_AGE_HOURS`, default 24h)
2. **Parallel RPCs** — `getTransaction` + `getTransactionReceipt` in `Promise.all` (rc2 optimization)
3. **Receipt status check** — Verifies `receipt.status === 'success'` (not just existence)
4. **Anchoring with retries** — BullMQ with exponential backoff (5 attempts) + `anchor_failed` state
5. **Address formatting** — Case-insensitive comparison with `.toLowerCase()`

### ⚠️ Minor observations

| # | Observation | Risk | Recommendation | Priority |
|---|-------------|--------|---------------|-----------|
| B-1 | `anchorRecord` receives `''` as 2nd arg (empty contenthash) | Low | Refactor `anchorRecord` signature to not require this unused arg | v1.1 |
| B-2 | No gas estimation before anchor | Low | Add gas estimation + alert if > threshold to avoid failed tx in congested network | v1.1 |
| B-3 | ~~`FEE_TX_MAX_AGE_MS` hardcoded (24h)~~ | ✅ Resolved | `FEE_TX_MAX_AGE_HOURS` configurable via env (rc3) | — |

---

## 4. Code Quality — Findings

### ✅ Strengths

1. **Strict TypeScript** — Well-defined types, no `any` in public interfaces
2. **Error factory pattern** — Each error has its factory function with fixed code and message → immutability
3. **Schema validation with Zod** — Input validation before any business logic
4. **Robust DB schema** — CHECK constraints for `state`, `visibility`, `content_hash`. Compound UNIQUE for anti-replay
5. **Idempotency** — UNIQUE constraints + HTTP 409 for duplicates
6. **Modular structure** — Clear separation: `routes/`, `services/`, `config/`, `utils/`, `workers/`, `db/`
7. **Graceful shutdown** — App and worker exit cleanly on SIGTERM/SIGINT (rc3)

### ⚠️ Observations

| # | Observation | Risk | Recommendation | Priority |
|---|-------------|--------|---------------|-----------|
| Q-1 | ~~`records.ts` is 349 lines long~~ | ✅ Resolved | Extracted `recordsService.ts` — handler from ~140 to ~30 lines (rc3) | — |
| Q-2 | ~~No graceful shutdown in `app.ts`~~ | ✅ Resolved | SIGTERM/SIGINT drains requests, closes BullMQ and PostgreSQL (rc3) | — |
| Q-3 | ~~Worker has no graceful shutdown~~ | ✅ Resolved | `worker.close()` on SIGTERM, finishes ongoing jobs (rc3) | — |

---

## 5. Documentation — Status

| Document | Status | Action taken |
|-----------|--------|---------------|
| `alpha-test-report.md` | ✅ Up to date | Updated with rc2 results (429 fix, 10/10 tests) |
| `CHANGELOG.md` | ✅ Up to date | rc3 section: hardening (graceful shutdown, env, refactor) |
| `error-catalog.md` | ✅ Up to date | Already included 429 `rate_limit_exceeded` |
| `runbook.md` | ✅ Up to date | 6 covered scenarios, correct metrics |
| `README.md` | ✅ Up to date | CI Node 20+22 badges, v8 coverage, `test:coverage` script |
| `Implementation_Plan.md` | ✅ Up to date | Marked as historical reference |
| `tools-and-skills.md` | ✅ Up to date | Documented skills and MCPs |

---

## 6. GitHub Issues — Status

| Issue | Title | Status | Note |
|-------|--------|--------|------|
| #1–#10 | v1.0 Phases + technical decisions | ✅ Closed | All MVP implemented + tech stack approved |
| #11 | Provenance metadata field | 🟢 Open (v1.1) | Design ready in `c2pa-interoperability.md` |
| #12 | Batch endpoint | 🟢 Open (v1.1) | — |
| #13 | Status webhooks | 🟢 Open (v1.1) | — |
| #14 | Double temporal attestation | 🟢 Open (v1.1) | — |
| #15 | model_id Verification | 🟢 Open (v2+) | Exploratory research |

---

## 7. Skills Summary used

| Skill | Usage |
|-------|-----|
| `production-code-audit` | Code audit checklist, report structure |
| `api-security-best-practices` | Helmet, CORS, rate limiting, error handling, input validation review |
| `blockchain-developer` | Fee verification, anchoring, wallet management review |

---

## 8. Recommendations for v1.1

Following rc3 hardening, observations Q-1, Q-2, Q-3, and B-3 are **resolved**. Pending for v1.1:

1. **S-1: KMS for private key** — Essential before real production
2. **S-3: Pino logger in worker** — Uniform logs with Fastify
3. **B-1: Refactor `anchorRecord` signature** — Remove 2nd empty argument
4. **B-2: Gas estimation** — Before anchor to avoid failed tx

> **Conclusion:** The project is in excellent condition for a private alpha. The 4 quality/robustness items from the original audit are resolved (rc3). Code quality is high, invariants are protected, and documentation is updated.
