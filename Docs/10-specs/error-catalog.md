# Error Catalog — Res ex Machina API v1

> **Version**: 1.0  
> **Date**: 2026-02-10  

---

## Error Format

All errors follow this JSON format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description of the error",
    "details": {}
  }
}
```

- `code`: Unique error code (snake_case, in English)
- `message`: Human description (in English)
- `details`: Optional object with additional context (never contains sensitive data)

---

## Errors by endpoint

### POST /v1/records

| HTTP | Code | Description | When |
|---|---|---|---|
| 400 | `invalid_payload` | Malformed or incomplete request body | Missing required field, invalid JSON |
| 400 | `invalid_content_hash` | content_hash does not match `sha256:{64hex}` format | Incorrect format |
| 400 | `invalid_pog_schema` | pog_bundle does not match PoG v1 schema | Missing fields, wrong types |
| 400 | `invalid_pog_version` | `schema` field of PoG is not `pog.v1` | Unsupported version |
| 400 | `invalid_tags` | Invalid tags (more than 10, empty, or wrong type) | Malformed array |
| 400 | `invalid_visibility` | Unallowed value for visibility | Not proof_only / input_hash_only / content_optional |
| 400 | `payload_too_large` | Request body exceeds size limit | Body > 64KB or pog_bundle > 32KB |
| 401 | `invalid_signature` | Invalid or unverifiable EIP-712 signature | Malformed or corrupted signature |
| 401 | `signer_mismatch` | Recovered signer ≠ agent_wallet of PoG | Signer's wallet does not match |
| 402 | `fee_not_verified` | fee_tx_hash not verified on-chain | Tx not found or unconfirmed |
| 402 | `fee_insufficient` | Insufficient fee amount | value < minimum fee |
| 402 | `fee_wrong_recipient` | Incorrect fee recipient | to ≠ fee_receiver_address |
| 402 | `fee_tx_expired` | Fee transaction too old | Tx > 24h |
| 409 | `fee_tx_reused` | fee_tx_hash already used in another record | Payment reuse |
| 409 | `duplicate_content_hash` | A record with this content_hash already exists | Idempotency |
| 409 | `duplicate_nonce` | This nonce was already used by this wallet | Anti-replay |
| 429 | `rate_limit_exceeded` | Too many requests from this wallet | Rate limit per window exceeded |

### GET /v1/records/mine

| HTTP | Code | Description | When |
|---|---|---|---|
| 401 | `missing_auth_headers` | Missing authentication headers | X-Wallet-Address, X-Signature or X-Timestamp not sent |
| 401 | `invalid_wallet_address` | Invalid wallet address | X-Wallet-Address does not match 0x + 40 hex format |
| 401 | `auth_timestamp_expired` | Timestamp out of window | Invalid X-Timestamp or outside 5 minute window |
| 401 | `auth_signature_invalid` | Invalid wallet signature | EIP-191 signature does not match declared wallet |

### GET /v1/records/{id}

| HTTP | Code | Description | When |
|---|---|---|---|
| 400 | `invalid_record_id` | ID is not a valid UUID | Incorrect format |
| 404 | `record_not_found` | No record exists with this ID | Valid UUID but non-existent |

### GET /v1/records/verify?content_hash={hash}

| HTTP | Code | Description | When |
|---|---|---|---|
| 400 | `invalid_content_hash` | Hash does not match required format | Incorrect format |
| 404 | `record_not_found` | No record exists with this hash | Valid hash but not registered |

### GET /v1/records/{id}/export

| HTTP | Code | Description | When |
|---|---|---|---|
| 400 | `invalid_record_id` | ID is not a valid UUID | Incorrect format |
| 404 | `record_not_found` | No record exists with this ID | Valid UUID but non-existent |

### GET /v1/health

| HTTP | Code | Description | When |
|---|---|---|---|
| 200 | — | System ok | All checks passing |
| 503 | — | System degraded | One or more checks failing (response includes status: degraded) |
### POST /v1/records/batch

| HTTP | Code | Description | When |
|---|---|---|---|
| 400 | `batch_empty` | Batch contains no records | Empty `records` array |
| 400 | `batch_too_large` | Batch exceeds limit of 100 records | Over 100 records in array |
| 400 | `batch_invalid_payload` | Batch request body malformed | Invalid JSON or invalid schema |
| 201 | — | All records created successfully | All items processed successfully |
| 207 | — | Mixed response (successes and failures) | Some items failed, others ok |

> **Note**: Each individual record can return the same errors as `POST /v1/records` (invalid_payload, fee_*, duplicate_*, etc.) within the `results` array.

### POST /v1/webhooks

| HTTP | Code | Description | When |
|---|---|---|---|
| 400 | `webhook_invalid_url` | Not allowed URL (SSRF protection) | HTTP URL, private IP, localhost |
| 400 | `webhook_limit_reached` | Limit of 5 webhooks per wallet reached | Already 5 active webhooks |
| 401 | `missing_auth_headers` | Missing authentication headers | walletAuth headers not sent |
| 401 | `auth_signature_invalid` | Invalid wallet signature | EIP-191 does not match wallet |

### DELETE /v1/webhooks/{id}

| HTTP | Code | Description | When |
|---|---|---|---|
| 403 | `webhook_forbidden` | Only owner can manage webhook | Authenticated wallet ≠ webhook owner |
| 404 | `webhook_not_found` | Webhook not found | Non-existent ID or not belonging to wallet |

---

## Global Errors

| HTTP | Code | Description | When |
|---|---|---|---|
| 405 | `method_not_allowed` | HTTP method not supported | DELETE on any endpoint, PUT on records |
| 415 | `unsupported_media_type` | Content-Type is not application/json | Incorrect header |
| 429 | `rate_limit_exceeded` | Too many requests | Rate limit per window exceeded (Redis or in-memory) |
| 500 | `internal_error` | Internal server error | Unexpected error (never exposes details) |
| 503 | `service_unavailable` | Service temporarily unavailable | Maintenance or dependency failure |
| 503 | `service_degraded` | Write operations temporarily unavailable | Redis down + `RATE_LIMIT_WRITE_ON_REDIS_DOWN=503` (P0-1). Read operations remain available. Response includes `retry_after` hint. |

---

## SDK Client Errors

> These errors are thrown **client-side** by `@res-ex-machina/sdk` before any API call is made.

| Error Class | Code | Description | When |
|---|---|---|---|
| `RxMReadOnlyError` | `read_only_client` | Attempted write operation on a read-only client | Calling `record()`, `recordBatch()`, or webhook methods on a client initialized with `readOnly: true` |
| `RxMValidationError` | `missing_agent_wallet` | `listRecords()` called without `agentWallet` on a read-only client | Read-only client has no default wallet — must pass `agentWallet` explicitly |
| `RxMValidationError` | `invalid_readonly_config` | Conflicting constructor options | Passing `account`, `rpcUrl`, or `feeReceiverAddress` alongside `readOnly: true` |

> **Note**: `RxMReadOnlyError` extends `RxMError` and can be caught with `instanceof`. These errors are part of the SDK's typed error hierarchy alongside `RxMRateLimitError`, `RxMValidationError`, and `RxMApiError`.

---

## Error Principles

1. **Never expose technical details** — Do not reveal stack traces, routes, SQL queries, or table names.
2. **Unique and stable codes** — The same code always means the same thing. Once published, it does not change.
3. **English messages** — Messages are for developers, not end users.
4. **Optional details** — Only include useful debugging context (e.g. `{"field": "content_hash", "expected": "sha256:{64hex}"}`).
5. **Immutable errors** — Adding new codes is OK. Changing the meaning of an existing one, NEVER.
