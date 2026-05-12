# Integrator Guide — Res ex Machina

> How to monitor and troubleshoot your integration with Res ex Machina.

---

## API Health Check

**Endpoint:** `GET /v1/health`

| HTTP Code | `status` field | Meaning |
|---|---|---|
| 200 | `healthy` | All subsystems operational |
| 503 | `degraded` | One or more subsystems down |

**Response structure:**
```json
{
  "status": "healthy",
  "version": "v1",
  "timestamp": "2026-05-12T17:31:22.407Z",
  "checks": {
    "database": { "status": "ok", "latencyMs": 5 },
    "redis": { "status": "ok" },
    "blockchain": { "status": "ok", "latencyMs": 223, "blockNumber": 41419397 }
  }
}
```

**Caching:** Health results are cached for 30 seconds. The `X-Cache` header indicates `HIT` or `MISS`.

**Status Page:** [https://sebas-solver.github.io/Res-ex-Machina/](https://sebas-solver.github.io/Res-ex-Machina/)

---

## Record States

When you create a record via `POST /v1/records`, it progresses through these states:

| State | Meaning | Duration |
|---|---|---|
| `pending_anchor` | Record created, queued for blockchain anchoring | Seconds to minutes |
| `anchored` | Successfully anchored on-chain with transaction hash | Permanent |
| `anchor_failed` | Anchoring failed after retries | Check error field |

### What to do if your record is stuck in `pending_anchor`

1. **Wait 2-5 minutes** — The worker processes the queue; blockchain confirmation takes time
2. **Check health** — `GET /v1/health` → if Redis shows `error`, the queue is paused
3. **Poll the record** — `GET /v1/records/{id}` to check current state
4. **If >10 minutes**: The blockchain L2 may be congested. Records will be anchored when the L2 recovers

### What `anchor_failed` means

The system attempted to anchor your record but all retries failed. Common causes:
- Insufficient gas on the RxM wallet
- Blockchain L2 was unreachable for an extended period
- Network-level issues

**Your data is safe** — the record and its cryptographic proof exist in the database. Only the on-chain anchor failed. Contact us via [GitHub Issues](https://github.com/Sebas-Solver/Res-ex-Machina/issues) if this persists.

---

## Webhooks

If you've registered webhooks, you'll receive notifications on state changes:

| Transition | Webhook payload `new_state` |
|---|---|
| `pending_anchor` → `anchored` | `anchored` |
| `pending_anchor` → `anchor_failed` | `anchor_failed` |

Webhook payloads include HMAC-SHA256 signature in the `X-RxM-Signature` header. Verify with your webhook secret.

**Retry policy:** Failed webhook deliveries are retried up to 3 times with exponential backoff.

---

## Guarantees and Non-Guarantees

### ✅ What RxM guarantees

- **Immutability** — Records cannot be modified or deleted once created
- **Cryptographic verification** — Any third party can verify a PoG receipt offline
- **On-chain anchoring** — Successfully anchored records have a permanent blockchain trail
- **Neutrality** — RxM does not judge content, only records provenance facts

### ⚠️ What RxM does NOT guarantee

- **Uptime SLA** — Alpha stage. Best-effort availability. Check the [status page](https://sebas-solver.github.io/Res-ex-Machina/)
- **Anchoring speed** — Depends on L2 congestion and gas availability
- **Content originality** — RxM records declarations, not originality assessments
- **Model ID verification** — The declared `model_id` is not independently verified

---

## Rate Limits

| Tier | Requests | Window |
|---|---|---|
| Default | 100 | Per minute per IP |
| Burst | Allowed | Short bursts tolerated |

Rate limit headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.

---

*For SDK integration examples, see the [Quick Start guide](../40-guides/quick-start.md).*
*For full API reference, see the [OpenAPI spec](../10-specs/openapi-v1.yaml).*
