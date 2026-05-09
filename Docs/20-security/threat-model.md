# Threat Model — Res ex Machina v1

> **Version**: 1.0  
> **Status**: Draft  
> **Date**: 2026-02-10  
> **Methodology**: STRIDE + Attack Trees  
> **Skills used**: `threat-modeling-expert`, `stride-analysis-patterns`, `attack-tree-construction`, `api-security-best-practices`

---

## 1. System Scope

### 1.1 Description

Res ex Machina is a technical registry of AI generation facts. AI agents (identified by a cryptocurrency wallet) send evidentiary bundles (PoG) which are stored in Postgres and anchored on an EVM L2 blockchain.

### 1.2 Data Flow Diagram (DFD)

```
                    ┌─────────────────────────────────────────────┐
                    │              TRUST BOUNDARY 0               │
                    │              (Public Internet)              │
                    │                                             │
                    │  ┌──────────────┐                           │
                    │  │   AI Agent   │ ──── Untrusted            │
                    │  │   (wallet)   │      external entity      │
                    │  └──────┬───────┘                           │
                    │         │                                   │
                    └─────────┼───────────────────────────────────┘
                              │
                              │ HTTPS + EIP-712 signed payload
                              │ + fee_tx_hash
                              │
                    ┌─────────┼───────────────────────────────────┐
                    │         │    TRUST BOUNDARY 1               │
                    │         ▼    (Perimeter API)                │
                    │  ┌──────────────┐                           │
                    │  │  API Server  │ ──── Main process         │
                    │  │ (validation) │                           │
                    │  └──┬───┬───┬──┘                           │
                    │     │   │   │                               │
                    └─────┼───┼───┼───────────────────────────────┘
                          │   │   │
              ┌───────────┘   │   └───────────┐
              │               │               │
              ▼               ▼               ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │  PostgreSQL  │ │  Redis       │ │  Blockchain  │
    │  (records)   │ │  (rate limit │ │  L2 (anchor  │
    │              │ │   + queue)   │ │   + fee)     │
    └──────────────┘ └──────────────┘ └──────────────┘
      Data Store       Data Store       External Entity
      (trusted)        (trusted)        (semi-trusted)
```

### 1.3 Trust Boundaries

| ID | Boundary | From → To | Risk |
|---|---|---|---|
| TB-0 | Internet → API | Agent → API Server | **HIGH**: untrusted input |
| TB-1 | API → Database | API Server → Postgres | MEDIUM: injection, escalation |
| TB-2 | API → L2 Blockchain | API Server → RPC Node | MEDIUM: availability, reliability |
| TB-3 | API → Redis | API Server → Redis | LOW: ephemeral data |

---

## 2. Assets

| Asset | Sensitivity | Description |
|---|---|---|
| **Records** | CRITICAL | Immutable generation facts |
| **PoG Bundles** | HIGH | Signed cryptographic proofs |
| **EIP-712 Signatures**| HIGH | Cryptographic identity of agent |
| **fee_tx_hash** | HIGH | On-chain payment proof |
| **receipt_hash** | HIGH | Receipt integrity hash |
| **Server private keys**| CRITICAL | Keys for on-chain anchoring |
| **RPC/API Keys** | HIGH | Access to L2 node |
| **Record metadata** | MEDIUM | Tags, content_type, timestamps |
| **Fee config** | MEDIUM | fee_receiver_address, minimum amount |

---

## 3. STRIDE Analysis

### 3.1 Spoofing (Identity spoofing)

| ID | Threat | Target | Impact | Probability | Risk |
|---|---|---|---|---|---|
| S-01 | Wallet spoofing: signing a PoG with a wallet that isn't the real agent's | PoG Bundle | HIGH | LOW | 3 |
| S-02 | Theft of agent's private key and registering on their behalf | Agent identity | CRITICAL| LOW | 4 |
| S-03 | Replay attack: reusing a legitimately signed PoG | POST /v1/records | HIGH | MEDIUM | 6 |

**Implemented Mitigations:**
- [x] EIP-712 signature verification (recovered signer == agent_wallet) → INV-009
- [x] Unique nonce per wallet (UNIQUE constraint) → INV-014
- [x] Non-custodial private keys → The agent is solely responsible

**Residual Risks:**
- ⚠️ S-02: If an agent loses their private key, anyone can register on their behalf. **It is not the platform's responsibility** (INV-007). The platform registers facts, does not guarantee identity control.

---

### 3.2 Tampering (Data manipulation)

| ID | Threat | Target | Impact | Probability | Risk |
|---|---|---|---|---|---|
| T-01 | Modifying a record after creation | `records` table | CRITICAL| VERY LOW | 4 |
| T-02 | SQL injection via PoG bundle fields (JSONB) | PostgreSQL | CRITICAL| LOW | 4 |
| T-03 | Manipulating the content_hash (sending fake hash) | Hash integrity | HIGH | HIGH | 9 |
| T-04 | Manipulating the timestamp in the PoG | Temporality | MEDIUM | HIGH | 6 |

**Implemented Mitigations:**
- [x] Immutable records — no UPDATE or DELETE exist (INV-001, INV-002, INV-003)
- [x] CHECK constraint on content_hash (`^sha256:[a-f0-9]{64}$`)
- [x] CHECK constraint on state (only allowed values)
- [x] Parameterized queries (implementation requirement)
- [x] On-chain anchoring (cryptographic immutability)

**Residual Risks:**
- ⚠️ T-03: The platform **cannot verify that the hash corresponds to real content**. This is by design — the system registers declared facts, does not verify content (INV-005, INV-006).
- ⚠️ T-04: Timestamp is declared by the agent. The platform adds `created_at` (server time) but **cannot validate the agent's timestamp is true**. This is explicit in PoG v1 Spec.

---

### 3.3 Repudiation (Denial)

| ID | Threat | Target | Impact | Probability | Risk |
|---|---|---|---|---|---|
| R-01 | Agent denies having registered a PoG | Traceability | MEDIUM | LOW | 2 |
| R-02 | Platform denies having received a registration | Trust | HIGH | VERY LOW | 3 |

**Implemented Mitigations:**
- [x] EIP-712 signature cryptographically tied to agent → non-repudiation by design
- [x] receipt_hash returned to agent as proof of receipt
- [x] On-chain anchoring → immutable record verifiable by third parties
- [x] Audit logs (implementation requirement)

**Residual Risks:**
- ✅ Minimal risk. Cryptographic signature and on-chain anchoring make repudiation practically impossible.

---

### 3.4 Information Disclosure

| ID | Threat | Target | Impact | Probability | Risk |
|---|---|---|---|---|---|
| I-01 | Enumerate records of a specific wallet | Agent privacy | MEDIUM | MEDIUM | 4 |
| I-02 | Leaks in error messages (stack traces, internal routes)| System info | LOW | MEDIUM | 2 |
| I-03 | Exposure of anchor server's private key | System keys | CRITICAL| LOW | 4 |

**Implemented Mitigations:**
- [x] No list by wallet endpoint in v1 (INV-021)
- [x] Prohibited scoring/rankings/automatic conclusions (INV-022, INV-023, INV-024)
- [x] Generic error messages (implementation requirement)
- [x] Secrets management for keys (deployment requirement)

**Residual Risks:**
- ⚠️ I-01: Individual records **are public by design** (GET by hash or by ID). A persistent attacker could attempt to enumerate UUIDs (v7 is time-ordered). Mitigation: rate limiting on GET.
- ⚠️ I-03: Compromise of anchoring key would allow creating fraudulent transactions. Mitigation: HSM or vault in production + key rotation.

---

### 3.5 Denial of Service (DoS)

| ID | Threat | Target | Impact | Probability | Risk |
|---|---|---|---|---|---|
| D-01 | Massive record spam with minimum fees | API + DB + Chain| HIGH | MEDIUM | 6 |
| D-02 | Blockchain resources exhaustion (gas wars) | Anchoring | HIGH | LOW | 3 |
| D-03 | Request flood on GET (without authentication) | API Server | MEDIUM | HIGH | 6 |
| D-04 | Oversized payload in pog_bundle (huge JSONB) | API + DB | MEDIUM | MEDIUM | 4 |

**Implemented Mitigations:**
- [x] Mandatory fee per registration → economic cost to spam (INV-012)
- [x] Rate limiting per wallet (429 Too Many Requests)
- [x] Idempotency per content_hash (409 on duplicates)
- [x] Unique nonce (409 on replay)

**Additional Recommended Mitigations (implementation):**
- [x] **Rate limiting on GET** by IP — global 100 req/min (rateLimit.ts)
- [x] **Size limit** on pog_bundle (max 32KB, refine Zod) — alpha.3
- [x] **Tags limit** already defined (max 10) — enforcement via Zod `.max(10)`
- [ ] **WAF/Cloudflare** as first line of defense
- [x] **Queue sizing** for anchoring (removeOnComplete: 50, removeOnFail: 200, maxStalledCount: 2) — alpha.3

---

### 3.6 Elevation of Privilege

| ID | Threat | Target | Impact | Probability | Risk |
|---|---|---|---|---|---|
| E-01 | Admin access to anchoring operations | Anchor worker| CRITICAL| LOW | 4 |
| E-02 | Manipulation of fee_receiver_address | Fee config | CRITICAL| VERY LOW | 4 |
| E-03 | Direct database access (bypass API) | PostgreSQL | CRITICAL| LOW | 4 |

**Implemented Mitigations:**
- [x] No user roles in v1 — all wallets are equivalent (INV-007)
- [x] No admin endpoints exposed in public API

**Additional Recommended Mitigations (implementation):**
- [ ] **Network isolation** — DB only accessible from API server
- [ ] **Principio de least privilege** — API DB user with minimum permissions
- [ ] **Key separation** — anchoring key != API key
- [ ] **Audit log** of config changes

---

## 4. Attack Trees (critical threats)

### 4.1 🌳 Register a fraudulent PoG

```
ROOT: Register fraudulent PoG (content I didn't generate)
├── [OR] Obtain valid signature
│   ├── [AND] Steal victim agent's private key
│   │   ├── Phishing (social engineering)        [Cost: LOW, Detection: MEDIUM]
│   │   ├── Agent server compromise              [Cost: HIGH, Detection: MEDIUM]
│   │   └── Malware in execution environment     [Cost: MEDIUM, Detection: LOW]
│   └── [AND] Generate own signature (new wallet)
│       └── Sign PoG with own wallet ← ALWAYS POSSIBLE
│           └── ⚠️ Accepted risk: platform DOES NOT verify authorship,
│               only registers agent's declaration
│
├── [OR] Reuse legitimate PoG
│   ├── Replay with same nonce → BLOCKED (UNIQUE constraint)
│   └── Modify nonce and re-sign → Requires original private key
│
└── [OR] Manipulate post-registration data
    ├── UPDATE in DB → BLOCKED (no UPDATE exists, INV-002)
    ├── DELETE in DB → BLOCKED (no DELETE exists, INV-001)
    └── Alter anchoring → BLOCKED (immutable blockchain)
```

**Conclusion**: The only possible path is to sign content you didn't generate with your own wallet. This **is not a bug, it's the design**: the platform registers declarations, does not verify actual generation.

---

### 4.2 🌳 Make spam economically viable

```
ROOT: Fill DB with garbage records without significant cost
├── [OR] Avoid the fee
│   ├── POST without fee_tx_hash → BLOCKED (402 fee_not_verified)
│   ├── Fake fee_tx_hash → BLOCKED (on-chain verification)
│   └── Reuse fee_tx_hash → BLOCKED (UNIQUE constraint)
│
├── [OR] Very cheap fee → send thousands
│   └── Minimum fee MUST be calibrated so spam cost
│       exceeds benefit. If fee = $0.01 and I send 1M records:
│       → Cost: $10,000 + gas fees
│       → Attacker's benefit? None direct.
│       → ⚠️ Risk: polluting DB with garbage data.
│       → Mitigation: rate limit per wallet + calibrated fee
│
└── [OR] DDoS on GET endpoints (no fee)
    ├── Flood of GET /v1/records/{id} → IP Rate limit
    ├── Flood of GET /v1/records/verify → IP Rate limit
    └── ⚠️ Mitigation: WAF + CDN + response caching
```

---

### 4.3 🌳 Compromise anchoring integrity

```
ROOT: Create fraudulent anchors on the blockchain
├── [OR] Obtain anchor worker's private key
│   ├── Server access → MITIGATION: hardened infra + vault
│   ├── Environment variable leak → MITIGATION: secrets management
│   └── Insider attack → MITIGATION: multi-sig for anchoring (v2+)
│
├── [OR] Manipulate the RPC node
│   ├── MITM in API conn → RPC node → MITIGATION: TLS + trusted RPC
│   ├── Compromised RPC node → MITIGATION: multiple providers (failover)
│   └── Selective transaction censorship → LOW risk on decentralized L2s
│
└── [OR] Reorg attack on L2
    └── 51% attack → EXTREMELY LOW on fast finality L2s
        (protected by L1 security)
```

---

## 5. Prioritized Risk Matrix

```
                      IMPACT
             Low   Medium   High  Critical
           ┌──────┬──────┬──────┬──────┐
   Low     │      │ R-01 │ S-01 │ S-02 │
           │      │  (2) │  (3) │  (4) │
           ├──────┼──────┼──────┼──────┤
   Medium  │ I-02 │ I-01 │ S-03 │      │
PROB.      │  (2) │  (4) │ D-01 │      │
           │      │      │  (6) │      │
           ├──────┼──────┼──────┼──────┤
   High    │      │ D-04 │ D-03 │ T-03 │
           │      │  (4) │  (6) │  (9) │
           ├──────┼──────┼──────┼──────┤
  Critical │      │      │      │      │
           │      │      │      │      │
           └──────┴──────┴──────┴──────┘
```

### Top 5 Risks

| Rank | ID | Threat | Score | Status |
|---|---|---|---|---|
| 1 | **T-03** | Fake hash (non-existent content) | 9 | **Accepted** (by design) |
| 2 | **S-03** | Replay attack | 6 | **Mitigated** (UNIQUE nonce) |
| 3 | **D-01** | Spam with minimum fees | 6 | **Partially mitigated** |
| 4 | **D-03** | DDoS on GET endpoints | 6 | **Pending** (IP rate limit) |
| 5 | **T-04** | Manipulated timestamp | 6 | **Accepted** (by design) |

---

## 6. Security Decisions

### ACCEPTED Risks (by design)

These risks are a direct consequence of the foundational principles:

| Risk | Why it is accepted |
|---|---|
| Fake hash of non-existent content | The platform is **content-agnostic** (INV-005). Does not verify content. |
| Fake declared timestamp | Platform registers **declarations**, not verifiable facts. Server `created_at` is the real anchor. |
| Stolen wallet used to register | Platform **does not custody keys** (INV-007). Wallet security is agent's responsibility. |

### MITIGATED Risks

| Risk | Mitigation |
|---|---|
| Replay attack | UNIQUE Nonce per wallet |
| Wallet spoofing | EIP-712 verification |
| Post-registration modification | Immutability + anchoring |
| Spam | On-chain fee + rate limit + idempotency |
| Repudiation | Cryptographic signature + receipt_hash + on-chain anchor |
| SSRF via webhooks (IPv4 + IPv6) | DNS resolution + IP range blocking (audit fix) |
| Duplicate on-chain anchoring | Idempotency check in anchorRecord (audit fix) |

### PENDING Implementation Risks

| Risk | Recommended Mitigation | Priority | Status |
|---|---|---|---|
| DDoS on GET endpoints | IP Rate limit | **HIGH** | ✅ Implemented (rateLimit.ts) |
| Oversized payload | Size limit pog_bundle (32KB) | MEDIUM | ✅ Implemented (Zod refine) |
| Compromised anchoring key | HSM / Vault / Multi-sig | MEDIUM | ⏳ Pending |
| UUID enumeration | Rate limit on GET + monitoring | LOW | ✅ Rate limit on GET |
| Direct DB access | Network isolation + least privilege | **HIGH** | ⏳ Hosting config |
| SSRF via IPv6 in webhooks | resolve6() in urlValidator | **HIGH** | ✅ Implemented (audit fix) |
| Anchor tx duplication (BullMQ stalled) | State check before sendTransaction | **CRITICAL** | ✅ Implemented (audit fix) |

---

## 7. Implementation Recommendations

### Immediate (before production)

1. **IP rate limiting** on all GET endpoints
2. **Body size limit** for requests (e.g. 64KB max total, 16KB max pog_bundle)
3. **Mandatory TLS 1.3** on all connections
4. **Error sanitization** — never return stack traces or internal routes
5. **Network isolation** — PostgreSQL and Redis only accessible from API

### Short term (30 days post-launch)

1. **WAF** with OWASP rules
2. **Secrets management** (Vault or equiv) for anchoring and RPC keys
3. **Centralized audit logging** immutable
4. **Anomaly monitoring** — registration spikes, suspicious wallets

### Long term (v2+)

1. **Multi-sig for anchoring** — require 2/3 signatures to anchor
2. **Multiple RPC providers** — automatic failover
3. **Bug bounty program** — incentives for reporting vulnerabilities
4. **Periodic penetration testing**

---

## 8. Security Invariants Inventory

| Invariant | STRIDE Category | Threat mitigated |
|---|---|---|
| INV-001 (records_are_permanent) | Tampering | T-01 |
| INV-002 (no_update_fields) | Tampering | T-01 |
| INV-003 (no_delete_records) | Tampering | T-01 |
| INV-007 (no_custody) | Spoofing | S-02 (agent responsibility) |
| INV-009 (pog_must_be_signed) | Spoofing | S-01 |
| INV-012 (fee_always_required) | DoS | D-01 |
| INV-014 (nonce_uniqueness) | Spoofing | S-03 |
| INV-019 (anchor_failed_valid) | Tampering | Record integrity |
| INV-020 (fee_must_be_onchain) | DoS | D-01 |
| INV-021 (no_public_listing) | Info Disclosure | I-01 |
| INV-022 (no_scoring) | Info Disclosure | I-01 |
