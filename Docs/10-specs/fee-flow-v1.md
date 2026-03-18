# Fee Flow v1 — Technical Specification

> **Version**: 1.0  
> **Status**: Draft  
> **Date**: 2026-02-10  

---

## 1. Summary

In v1, the fee is an **on-chain payment in the L2 native token** (ETH on most EVM L2s).

The agent pays the fee **before** calling the API. The API verifies that the transaction exists and is confirmed.

---

## 2. Flow

```
AI Agent                        L2 Blockchain                Res ex Machina API
    │                               │                             │
    │  1. Calculates required fee   │                             │
    │     (query or fixed)          │                             │
    │                               │                             │
    │  2. Sends payment tx ────────>│                             │
    │     (to: fee_receiver_address)│                             │
    │     (value: fee_amount)       │                             │
    │                               │  3. Tx confirmed            │
    │  4. Gets fee_tx_hash  <───────│                             │
    │                               │                             │
    │  5. Includes fee_tx_hash      │                             │
    │     in POST /v1/records ─────────────────────────────────>  │
    │                               │                             │
    │                               │  6. API verifies fee_tx_hash│
    │                               │     - Tx exists?            │
    │                               │     - Confirmed?            │
    │                               │     - Amount >= min fee?    │
    │                               │     - Correct recipient?    │
    │                               │     - fee_tx_hash not reused│
    │                               │                             │
    │                               │  7. If OK → create record   │
    │  <─── 201 Created ──────────────────────────────────────────│
    │                               │                             │
```

---

## 3. Fee Verification

The API verifies the `fee_tx_hash` by querying the L2:

```yaml
fee_verification:
  checks:
    - tx_exists: "The transaction exists on the L2"
    - tx_confirmed: "The tx has at least N confirmations (e.g. 1-3)"
    - tx_amount: "The value >= current minimum fee"
    - tx_recipient: "The 'to' field is the official fee_receiver address"
    - tx_not_reused: "The fee_tx_hash has not been used in another record"
    - tx_recent: "The tx was created in the last N hours (e.g. 24h)"
  
  on_failure:
    - 402: "fee_not_verified"
    - detail: "Specific failure reason"
```

---

## 4. Fee Parameters

```yaml
fee_config:
  # Address receiving the fees (controlled by Res ex Machina)
  fee_receiver_address: "0x..."  # Defined at deployment
  
  # Minimum fee per record (in wei or native unit)
  fee_minimum_amount: "TBD"  # Calibrated with real data
  
  # Currency
  fee_currency: "ETH"  # Native token of the chosen L2
  
  # Validity window for the fee tx
  fee_tx_max_age_hours: 24
  
  # Minimum confirmations
  fee_tx_min_confirmations: 1
```

---

## 5. Data Model

The `records` table already includes:

```sql
fee_amount    NUMERIC(18, 8) NOT NULL,
fee_currency  VARCHAR(8) NOT NULL,
fee_tx_hash   VARCHAR(66) NOT NULL,  -- Mandatory
```

Additional table to prevent fee_tx_hash reuse:

```sql
-- Each fee_tx_hash can only be used once
-- This is guaranteed by the UNIQUE constraint on records(fee_tx_hash)
-- No separate table needed if fee_tx_hash is unique in records

-- Alternative if a fee_tx_hash can cover multiple records (future batch):
-- CREATE TABLE used_fees (
--     fee_tx_hash VARCHAR(66) PRIMARY KEY,
--     used_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
--     record_id   UUID REFERENCES records(record_id)
-- );
```

> **v1 Decision**: One `fee_tx_hash` = one `record`. 1:1 ratio. 
> Guaranteed with a UNIQUE constraint on `fee_tx_hash` in the `records` table.

---

## 6. Scope OUT (v1)

```yaml
fee_scope_out:
  - fiat_payments          # v2. Fiat payment gateway
  - credit_pools           # v2. Prepaid credits
  - tiered_pricing         # v2. Volume discounts
  - batch_fee              # v1.1. One fee for multiple records
  - fee_refunds            # NEVER. Fees are not refunded
  - fee_negotiation        # NEVER. Fee is public and fixed
```

---

## 7. Fee Invariants

| ID | Rule |
|---|---|
| INV-012 | No record can exist without paid fee |
| INV-020 | Fee is verified against real on-chain tx |
| — | A fee_tx_hash can only be used once |
| — | Fees are not refunded |
| — | Fee is public and the same for everyone (v1) |

---

## 8. Planned Evolution

| Version | Changes |
|---|---|
| v1 | Simple on-chain fee, L2 native token, 1:1 with record |
| v1.1 | Batch: 1 fee → N records |
| v2 | Fiat gateway + prepaid credits + tiered pricing |
| v3 | Fee smart contract with automatic discount logic |
