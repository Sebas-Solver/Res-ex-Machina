---
name: repo-guardian
description: >-
  Use when committing, pushing, creating PRs, writing docs, adding scripts,
  or modifying any file in the Res-ex-Machina public repository. Enforces
  the license boundary between open protocol and proprietary operations.
metadata:
  category: discipline
  triggers:
    - git commit
    - git push
    - new file
    - new script
    - documentation
    - PR description
    - issue body
    - env file
    - wallet address
    - infrastructure
    - license compliance
---

# Repo Guardian — Public Repository Exposure Prevention

## Iron Law

**Nothing operational, nothing secret, nothing strategic goes into the public repo. If in doubt, it goes to `RxM-private`.**

Violating the letter IS violating the spirit. There are no "quick exceptions."

---

## 1. NEVER Commit These to the Public Repo

### 1.1 Secrets & Credentials (CRITICAL — immediate revocation required if violated)

| Category | Examples | Action if found |
|----------|----------|-----------------|
| **Private keys** | `0x` + 64 hex chars (except Anvil dev key `0xac0974bec...`) | Revoke key IMMEDIATELY, rotate, purge from git history |
| **Database URLs** | `postgres://user:pass@host/db`, `rediss://...` | Revoke credentials, rotate |
| **API tokens/DSNs** | Sentry DSN, Upstash tokens, Render API keys | Rotate token |
| **Encryption keys** | `WEBHOOK_SECRET_ENCRYPTION_KEY`, any base64 key material | Full incident response |
| **Real `.env` files** | `.env`, `.env.local`, `.env.production` | Already in `.gitignore` — NEVER remove those entries |

> **The Anvil key `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` is safe.**
> It is Foundry's publicly-known development key #0. It MAY appear in test files only.

### 1.2 Operational Infrastructure (goes to `RxM-private`)

| Category | Examples |
|----------|----------|
| **Deployment scripts** | `deploy.sh`, `migrate-prod.ts`, Docker prod configs |
| **Runbooks** | Incident response, scaling procedures, rotation guides |
| **Cost analysis** | Provider pricing, break-even calculations, margin targets |
| **Queue inspection** | `inspect-queue.ts`, `obliterate-queue.ts`, `check-db-*.ts` |
| **Migration scripts** | `migrate-webhook-secrets.ts`, DB migration runners |
| **Backup scripts** | `_backup-*.ts`, snapshot tools |
| **Smoke tests against production** | `smoke-test-live.ts`, `smoke-test-11c.ts` |
| **Test output with real data** | `test-results.txt`, logs with real wallets/tx hashes |

### 1.3 Strategy & Business Logic (goes to `RxM-private`)

| Category | Examples |
|----------|----------|
| **Pricing details** | Free tier credits, discount thresholds, subsidy strategy |
| **PRD / roadmap details** | Internal product requirements, competitive positioning |
| **Threat model (full)** | Attack vectors, risk assessments, pen-test results |
| **Audit reports (full)** | Security audit details, vulnerability findings |
| **License strategy** | `license-analysis-advisor.md`, legal counsel notes |
| **Narrative/positioning** | Market positioning, competitive analysis |

---

## 2. ALWAYS Keep These in the Public Repo (Apache 2.0)

| Component | Why |
|-----------|-----|
| **PoG v1 Protocol spec** | Open standard — closing it kills adoption |
| **TypeScript SDK** (`packages/sdk/`) | Acquisition channel, not the moat |
| **OpenAPI spec** | Defines how to talk to RxM |
| **Error catalog** | Developer trust requires stable, documented errors |
| **Offline verifier** (`verify-receipt.ts`) | Protocol neutrality requires independent verification |
| **Receipt verification spec** | Self-contained verification must be public |
| **C2PA interoperability spec** | Adoption enabler |
| **Developer guide** (minus production deployment) | Integration reference |
| **Tests** | Confidence + compatibility verification |
| **`.env.example`** (dev only, with placeholders) | Local dev onboarding |
| **`docker-compose.yml`** (dev only) | Local development stack |

---

## 3. Rules for Documentation & Examples

### 3.1 Wallet Addresses in Docs

- **NEVER** use real production/testnet wallets in documentation examples
- **ALWAYS** use standard fictitious addresses:
  - Agent wallet: `0x1234567890abcDEF1234567890abcDEF12345678`
  - Fee receiver: `0xABCDabcdABCDabcdABCDabcdABCDabcdABCDabcd`
  - Zero address: `0x0000000000000000000000000000000000000000` (OK — it's a standard)
- **Recalculate all dependent hashes** when replacing wallets in examples
- The Anvil key wallet (`0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`) is acceptable in test examples only

### 3.2 TX Hashes & URLs in Docs

- **NEVER** include real transaction hashes from production/testnet
- **ALWAYS** use truncated fictional hashes: `0xabcdef...9876`
- **OK** to reference the public API URL (`https://res-ex-machina-api.onrender.com`) — it's already in the README

### 3.3 Issue & PR Descriptions

- **NEVER** paste production logs containing wallets, tx hashes, or DB queries
- **NEVER** include infrastructure URLs with credentials
- **OK** to reference error messages, stack traces (redact wallet addresses)
- **OK** to describe bugs technically without operational details

---

## 4. SPDX License Headers

Every source file in `src/` MUST have a license header as the first line:

```typescript
// SPDX-License-Identifier: Apache-2.0
```

For private repo files (`RxM-private`):

```typescript
// SPDX-License-Identifier: LicenseRef-RxM-Proprietary
// Copyright (c) Res ex Machina. All rights reserved.
```

---

## 5. `.gitignore` Safety Net

The following patterns MUST remain in `.gitignore` at all times:

```gitignore
# Secrets
.env
.env.local
.env.production

# Operational scripts
scripts/_*
scripts/smoke-test-*.ts
scripts/check-db-*.ts

# Test output
test-results.txt

# Private repo
private/
```

**NEVER remove these entries.** If a file matches these patterns and needs to be public, rename it to not match the pattern.

---

## 6. Pre-Push Checklist

Before every `git push` to the public repo, verify:

- [ ] No private keys in any staged file (except Anvil dev key in tests)
- [ ] No real wallet addresses in documentation (use `0x1234...5678`)
- [ ] No database/Redis URLs with credentials
- [ ] No operational scripts (migration, backup, queue inspection)
- [ ] No test output with production data
- [ ] No pricing/cost/strategy documents
- [ ] All new `src/` files have `SPDX-License-Identifier: Apache-2.0` header
- [ ] `.gitignore` safety entries are intact

---

## 7. Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "It's just a testnet wallet" | Testnet wallets reveal operational infrastructure. Use fictitious addresses. |
| "The script is harmless" | Operational scripts reveal internal architecture. Move to `RxM-private`. |
| "I'll remove it later" | Git history is permanent. It stays forever unless you force-push (destructive). |
| "It's just an example" | Examples with real data ARE real data exposure. Use `0x1234...5678`. |
| "The API URL is already public" | The URL is OK. Wallet addresses, DB queries, and tx hashes next to it are NOT. |
| "It's just a smoke test" | Smoke tests against production contain real endpoints and wallets. Private repo. |

---

## 8. Red Flags — STOP and Review

If you see any of these in staged changes, **STOP** before committing:

- Any `0x` followed by 64 hex characters that isn't the Anvil key
- Any `postgres://` or `rediss://` URL
- Any file matching `scripts/_*` or `scripts/smoke-test-*`
- Any `.env` file (not `.env.example`)
- Any file containing `DATABASE_URL=`, `REDIS_URL=`, `SENTRY_DSN=` with real values
- Any PR description with production log output
- Any pricing, cost, or margin numbers

**All mean:** Remove from staging, move to `RxM-private` if needed, then proceed.

---

## 9. Valid Exceptions

- **Anvil dev key** (`0xac0974bec...`) in test files — this is a publicly-known development key
- **Zero address** (`0x0000...0000`) in EIP-712 domain — this is a standard protocol value
- **Public API URL** in README/docs — the endpoint is intentionally public
- **Stack mention** ("Render + Neon + Upstash") in README — generic stack info, no credentials

**Everything else:** If in doubt, ask. If still in doubt, it goes to `RxM-private`.

---

## References

- License Architecture: `RxM-private/strategy/license-analysis-advisor.md` (v2)
- Exposure Audit: Conversation `89dca113` (2026-05-17)
- `.gitignore`: Root of public repository
