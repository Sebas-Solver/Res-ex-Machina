# PRD v1 — Res ex Machina (Agent-Proof)

> **Version**: 1.1  
> **Status**: Draft (post-review)  
> **Date**: 2026-02-10  
> **Last Review**: 2026-02-10 (resolution of review gaps)  

---

## A) MVP Goal

The goal of MVP v1 is to allow AI agents to register output generation events, leaving a verifiable trail (hash + PoG + timestamp) that is publicly queryable, without ex-ante human validation.

Res ex Machina is a **registry of technical facts**, not rights. It is **content-agnostic** and **automated by default**.

---

## B) Scope IN

```yaml
scope_in:
  - register_generation_event       # POST /v1/records
  - agent_identity_via_wallet       # Auth via cryptographic signature
  - pog_v1_bundle_signed            # Signed Proof of Generation v1
  - immutable_timestamp_anchor      # Verifiable time anchor
  - public_verification_by_hash     # Public query by hash
  - public_verification_by_id       # Public query by record_id
  - fee_onchain_native_l2           # On-chain fee in L2 native token
  - json_receipt_export             # Export verifiable receipt
  - rate_limiting_per_wallet        # Burst control per wallet
  - idempotency_by_content_hash     # Same request = same record
  - nonce_anti_replay               # Unique nonce per wallet
  - health_endpoint                 # GET /v1/health (system status)
  - anchor_failure_handling          # anchor_failed state + retries
```

---

## C) Scope OUT (v1) — CRITICAL

```yaml
scope_out:
  - ai_detection                    # NEVER. We are not detectors
  - originality_scoring             # NEVER. We do not evaluate quality
  - human_validation_flows          # NEVER in v1. Exception, not the rule
  - content_moderation              # NEVER. We are not editors
  - content_curation                # NEVER. We are not curators
  - semantic_analysis               # NEVER. We do not interpret meaning
  - copyright_or_ip_claims          # NEVER. We do not assign rights
  - content_storage                 # v2-B. Hash only in v1
  - record_versioning               # v2-A. Links and derivations
  - state_machine                   # v2-A. Dynamic states
  - dispute_claims                  # v2-C. Claims and counter-claims
  - rich_ui_dashboard               # v2+. API only in v1
  - agent_reputation                # v3+. Cumulative scoring
  - smart_contracts_execution       # v3+. Licenses and payments
  - batch_endpoint                  # v1.1. Useful but not MVP
  - provenance_metadata             # v1.1. C2PA/IPTC/XMP bridge (see c2pa-interoperability.md)
  - search_advanced                 # v2+. Advanced search
  - list_records_by_wallet          # v2+. Controlled profiling (see section K)
  - fee_fiat_gateway                # v2. Fee in fiat
  - fee_credits_prepaid             # v2. Prepaid credits
  - dual_identity                   # v2. Org identity (X.509) + technical (wallet)
```

---

## D) Endpoints

```yaml
endpoints:

  - method: GET
    path: /v1/health
    auth: none
    description: System Status
    response:
      status: 200
      body:
        - status                # "ok" | "degraded"
        - db                    # "ok" | "error"
        - chain                 # "ok" | "error" | "degraded"
        - version               # "v1"

  - method: POST
    path: /v1/records
    auth: wallet_signature (EIP-712)
    description: Register a new generation event
    request_body:
      required:
        - content_hash          # SHA-256 of the output (format: sha256:{64hex})
        - pog_bundle            # Complete and signed PoG v1
        - fee_tx_hash           # Payment tx hash for fee (L2 on-chain)
      optional:
        - content_type          # MIME type of the output
        - tags                  # Free tags (array, max 10)
        - visibility            # proof_only | input_hash_only | content_optional
        - external_ref          # URL/pointer to external content
    response:
      status: 201
      body:
        - record_id             # UUID v7 (time-ordered, generated in app)
        - content_hash          # Echo of the submitted hash
        - receipt_hash          # Hash of the complete receipt
        - state                 # "pending_anchor"
        - created_at            # ISO-8601
        - anchor                # null (to be updated async)
    errors:
      400: invalid_payload (includes malformed content_hash)
      401: invalid_signature
      402: fee_not_verified (invalid or unconfirmed fee_tx_hash)
      409: duplicate_content_hash | duplicate_nonce
      429: rate_limit_exceeded

  - method: GET
    path: /v1/records/{id}
    auth: none (public)
    description: Query a record by ID
    response:
      status: 200
      body:
        - record_id
        - content_hash
        - pog_bundle            # Complete PoG v1
        - state                 # pending_anchor | anchored | anchor_failed
        - created_at
        - anchor                # tx_hash + block + chain_id (when available)
        - receipt_hash
        - anchor_error_reason   # Only if state == anchor_failed
    errors:
      404: record_not_found

  - method: GET
    path: /v1/records/verify
    auth: none (public)
    description: Verify existence by hash
    query_params:
      - hash                    # content_hash to search for
    response:
      status: 200
      body:
        - found: true/false
        - record_id             # If exists
        - state
        - created_at
        - anchor
    errors:
      400: missing_hash_param

  - method: GET
    path: /v1/records/{id}/export
    auth: none (public)
    description: Export verifiable receipt (JSON)
    response:
      status: 200
      content_type: application/json
      body:
        - record_id
        - content_hash
        - pog_bundle
        - receipt_hash
        - anchor
        - verification_instructions  # How to verify offline
    errors:
      404: record_not_found
```

---

## E) Versioned Schemas

### Record.v1

```json
{
  "schema": "record.v1",
  "record_id": "01957...",
  "content_hash": "sha256:abc123...",
  "content_type": "text/plain",
  "visibility": "proof_only",
  "pog_bundle": { "...see PoG v1 spec..." },
  "state": "pending_anchor",
  "created_at": "2026-02-10T02:00:00Z",
  "anchor": null,
  "receipt_hash": "sha256:def456...",
  "tags": ["code", "agent-output"],
  "external_ref": null,
  "fee": {
    "amount": "0.01",
    "currency": "ETH",
    "tx_hash": "0x..."
  }
}
```

### PoGBundle.v1

> See separate document: `pog-v1-spec.md`

### Agent.v1

```json
{
  "schema": "agent.v1",
  "wallet": "0x1234...abcd",
  "first_seen": "2026-02-10T02:00:00Z",
  "total_records": 42,
  "last_record_at": "2026-02-10T02:30:00Z"
}
```

> **Note**: Agent.v1 is a derived resource, not a CRUD endpoint.
> It breaks down from the history of records.
> There is no "create agent" endpoint — the agent exists when registering.

---

## F) Minimum Operational UX

```yaml
ui:
  purpose: operational_review_only
  target: humans_and_oversight
  
  views:
    - records_table           # List of records (read-only)
    - record_detail           # Record details
    - verify_by_hash          # Verify existence by hash
  
  forbidden_actions:
    - approve                 # NEVER. Nothing is approved
    - reject                  # NEVER. Nothing is rejected
    - edit_metadata           # NEVER. Registered data is immutable
    - delete_record           # NEVER. Nothing is deleted
    - assign_authorship       # NEVER. Authorship is not assigned
  
  notes:
    - "The UI is NOT a product in v1"
    - "It is an internal oversight tool"
    - "Agents and developers use the API directly"
    - "If a human needs to verify, they use GET /verify"
```

---

## G) Data Model (Postgres)

```sql
-- Main Table
-- NOTE: record_id is UUID v7 (time-ordered), generated in the application.
-- DO NOT use gen_random_uuid() which generates UUID v4 (random).
CREATE TABLE records (
    record_id         UUID PRIMARY KEY,  -- UUID v7, generated in app
    content_hash      VARCHAR(128) NOT NULL UNIQUE
                      CHECK (content_hash ~ '^sha256:[a-f0-9]{64}$'),
    content_type      VARCHAR(64),
    visibility        VARCHAR(32) NOT NULL DEFAULT 'proof_only'
                      CHECK (visibility IN ('proof_only', 'input_hash_only', 'content_optional')),
    pog_bundle        JSONB NOT NULL,
    nonce             VARCHAR(64) NOT NULL,
    agent_wallet      VARCHAR(42) NOT NULL,
    state             VARCHAR(32) NOT NULL DEFAULT 'pending_anchor'
                      CHECK (state IN ('pending_anchor', 'anchored', 'anchor_failed')),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    receipt_hash      VARCHAR(128) NOT NULL,
    tags              TEXT[] DEFAULT '{}',
    external_ref      TEXT,
    fee_amount        NUMERIC(18, 8) NOT NULL,
    fee_currency      VARCHAR(8) NOT NULL,
    fee_tx_hash       VARCHAR(66) NOT NULL UNIQUE, -- 1:1 with record, non-reusable
    anchor_tx_hash    VARCHAR(66),
    anchor_block      BIGINT,
    anchor_chain_id   INTEGER,
    anchor_error_reason TEXT,                -- Reason for failure (if anchor_failed)
    anchor_retries    INTEGER NOT NULL DEFAULT 0,
    anchored_at       TIMESTAMPTZ,
    
    -- Anti-replay: A nonce cannot be reused by the same wallet
    CONSTRAINT uq_wallet_nonce UNIQUE (agent_wallet, nonce)
);

-- Indexes
CREATE INDEX idx_records_agent ON records(agent_wallet);
CREATE INDEX idx_records_state ON records(state);
CREATE INDEX idx_records_created ON records(created_at DESC);
CREATE INDEX idx_records_fee_tx ON records(fee_tx_hash);
```

---

## H) Main Flow

### H.1 Happy path

```
AI Agent                     Res ex Machina API           Blockchain (L2)
    │                              │                            │
    │  1. Generates output         │                            │
    │  2. Calculates hash          │                            │
    │  3. Pays fee on-chain ──────────────────────────────────> │
    │  4. Gets fee_tx_hash         │                            │
    │  5. Builds PoG bundle        │                            │
    │  6. Signs (EIP-712)          │                            │
    │                              │                            │
    │──POST /v1/records───────────>│                            │
    │  (includes fee_tx_hash)      │  7. Validates signature    │
    │                              │  8. Verifies fee_tx_hash   │
    │                              │  9. Verifies nonce         │
    │                              │  10. Verifies idempotency  │
    │                              │  11. Saves record          │
    │                              │  12. Computes receipt_hash │
    │<──201 { record_id, state:    │                            │
    │       pending_anchor }───────│                            │
    │                              │                            │
    │                              │  13. Enqueues anchoring ──>│
    │                              │                            │  14. Tx on-chain
    │                              │<── Tx confirmed ───────────│
    │                              │  15. Updates record        │
    │                              │      state: "anchored"     │
    │                              │                            │
```

### H.2 Unhappy path: anchor failure

```
Res ex Machina API                              Blockchain (L2)
    │                                                │
    │  13. Enqueues anchoring ──────────────────────>│
    │                                                │  Tx fails
    │<── Error / Timeout ────────────────────────────│
    │                                                │
    │  14. anchor_retries += 1                       │
    │  15. If retries < 3: re-enqueue with backoff   │
    │  16. If retries >= 3:                          │
    │      state = "anchor_failed"                   │
    │      anchor_error_reason = "..."               │
    │                                                │
    │  ⚠️ The record IS STILL VALID                  │
    │  ⚠️ The PoG and timestamp are immutable        │
    │  ⚠️ Nothing is deleted, nothing is invalidated │
    │  ⚠️ An operator can retry manually             │
    │                                                │
```

---

## I) Non-Functional Requirements (v1 summary)

| Category | Goal |
|---|---|
| Scale | 100–1,000 req/day, batch future |
| Soft latency | < 3 sec (immediate receipt) |
| Hard latency | 1–5 min (on-chain anchor) |
| SLA | 99.0% monthly |
| Custody | NO. Signature verification only |
| Anti-spam | On-chain fee + rate limit + idempotency + nonce |
| Fee | On-chain in native L2 token. Fiat/credits in v2 |
| Hosting | EU preferred, portable architecture |
| Blockchain | L2 EVM compatible |
| Infra | Cloud + Postgres + Redis + S3-compatible |
| Anchoring | Auto retry (3x). anchor_failed state if exhausted |

---

## J) Quick Glossary

| Term | Meaning |
|---|---|
| **Record** | A record of a generation fact |
| **PoG** | Proof of Generation — probabilistic bundle |
| **Anchor** | On-chain anchor (tx + block) |
| **Receipt** | Verifiable exportable package (JSON) |
| **Agent** | Technical entity (wallet) generating and signing |
| **Fee** | Mandatory on-chain micro-payment per registration |
| **State** | Current state: `pending_anchor`, `anchored`, `anchor_failed` |
| **Nonce** | Unique value per wallet preventing replay attacks |

---

## K) Profiling principles by wallet (forward design)

> **Context**: There is no public listing by wallet in v1, but the system is **designed** to support controlled profiling in future versions.

```yaml
profiling_rules:
  
  public_in_v1:
    - verification_by_content_hash    # Anyone can verify a hash
    - verification_by_record_id       # Anyone can query a record
  
  NOT_public_in_v1:
    - list_records_by_wallet          # NO public list by wallet
    - agent_scoring                   # NO scoring
    - agent_reputation                # NO reputation
  
  future_profiling_service:
    description: |
      Service analogous to a business registry:
      - The base registry is public
      - Analysis reports are a paid, contractual service
    
    access_control:
      - platform_admins               # Platform administrators
      - authorized_auditors            # Auditors / validators / oracles
      - enterprise_clients             # Enterprise clients under contract
    
    exposed_data:                      # Aggregated data only, NEVER judgments
      - total_records_count
      - temporal_windows
      - state_distribution             # anchored, failed, pending
      - registration_frequency
    
    FORBIDDEN_always:                  # Forbidden in ANY version
      - scoring
      - rankings
      - reliability_labels
      - automatic_conclusions
    
    principle: |
      "The system provides data; interpretation is
      the responsibility of the authorized user."
```
