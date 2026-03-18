# Operations Runbook — Res ex Machina

## Contact

- **Responsible**: @Sebas-Solver
- **Email**: sebas.solver@gmail.com

---

## 1. L2 RPC down or slow

### Symptoms
- `/v1/health` reports `l2.status: "degraded"` or `"down"`
- Anchoring jobs failing with `RPC error` or timeout
- BullMQ queue growing

### Actions
1. Verify RPC status on provider dashboard
2. If public RPC, switch to an alternative node:
   ```bash
   # .env
   L2_RPC_URL=https://alternative-polygon-rpc.com
   ```
3. Restart worker:
   ```bash
   npm run worker:anchor
   ```
4. Pending jobs will re-execute automatically (exponential backoff)
5. Verify queue emptying:
   ```bash
   # Check in Redis
   redis-cli LLEN bull:anchor:wait
   ```

### Impact
- **API keeps accepting records** — records are created with `state: pending_anchor`
- **Anchoring is delayed** until RPC returns
- **No data loss** — jobs remain in Redis

---

## 2. Stuck BullMQ queue

### Symptoms
- Jobs in `waiting` or `delayed` state growing
- Worker not processing
- `/v1/health` shows Redis healthy

### Actions
1. Verify worker is running:
   ```bash
   # If using START_INLINE_WORKER=false, the worker runs as a separate process/container.
   # Process alive?
   ps aux | grep anchor.worker
   ```
2. If worker died, restart:
   ```bash
   npm run worker:anchor
   ```
3. If there are `failed` jobs, check logs for reason
4. To manually retry failed jobs:
   ```bash
   # From app or script:
   # Jobs with remaining attempts retry automatically
   # If attempts exhausted, they stay in "failed"
   ```
5. If queue cleanup is needed (emergency):
   ```bash
   redis-cli DEL bull:anchor:failed
   ```

### Impact
- Records are created but not anchored
- Users see `state: pending_anchor` indefinitely
- No data loss

---

## 3. High error rate (>5% 5xx responses)

### Symptoms
- Frequent `"request completed with error"` logs
- 500 status in responses

### Actions
1. Review structured logs:
   ```bash
   # Filter for 5xx errors
   cat logs/app.log | jq 'select(.status_code >= 500)'
   ```
2. Identify pattern (always same endpoint? same wallet?)
3. Common causes:
   - **DB down** → verify PostgreSQL connection
   - **Redis down** → verify Redis connection
   - **OOM** → review container memory usage
4. Restart API:
   ```bash
   docker compose restart api
   ```

---

## 4. Retrying anchoring without breaking idempotency

### Context
- Each job uses `jobId: recordId` → **BullMQ does not allow duplicates**
- If a job fails all retries, it stays in `failed`
- The record resides in `state: anchor_failed`

### Safe procedure
1. Verify record exists and is in `anchor_failed`:
   ```sql
   SELECT record_id, state, anchor_retries, anchor_error_reason
   FROM records
   WHERE record_id = '<UUID>';
   ```
2. Reset state to re-enqueue:
   ```sql
   UPDATE records
   SET state = 'pending_anchor',
       anchor_retries = 0,
       anchor_error_reason = NULL
   WHERE record_id = '<UUID>'
     AND state = 'anchor_failed';
   ```
3. Enqueue manually (script or future admin endpoint):
   ```typescript
   import { enqueueAnchorJob } from './services/queue.js';
   await enqueueAnchorJob(recordId, receiptHash);
   ```
4. Verify it's being processed:
   ```bash
   redis-cli LLEN bull:anchor:active
   ```

### Security
- Idempotency guaranteed by `jobId = recordId`
- If job already exists in queue, BullMQ ignores it
- DB has UNIQUE on `receipt_hash` → no double anchoring

---

## 5. Database full or slow

### Actions
1. Verify space:
   ```sql
   SELECT pg_size_pretty(pg_database_size('rexm'));
   ```
2. Verify slow queries:
   ```sql
   SELECT query, mean_exec_time, calls
   FROM pg_stat_statements
   ORDER BY mean_exec_time DESC
   LIMIT 10;
   ```
3. Indexes already cover main queries:
   - `idx_records_agent_wallet` → queries by wallet
   - `idx_records_state` → worker searches for `pending_anchor`
   - `idx_records_created_at` → sort by date
   - `idx_records_fee_tx_hash` → verify unused fee

---

## 6. Clean start from scratch

```bash
# 1. Bring up infra
docker compose up -d

# 2. Wait healthchecks (~30s)
docker compose ps  # all "healthy"

# 3. Apply migrations
npm run db:push

# 4. Start API
npm run dev

# 5. Start worker
npm run worker:anchor

# 6. Verify
curl http://localhost:3000/v1/health
```

---

## Key Metrics to Monitor

| Metric | How to obtain | Alert if... |
|---|---|---|
| % 5xx | Logs: `status_code >= 500` | > 1% in 5 min |
| p95 Latency | Logs: `response_time_ms` | > 3000ms |
| Queue waiting | `redis-cli LLEN bull:anchor:wait` | > 100 jobs |
| Queue failed | `redis-cli LLEN bull:anchor:failed` | > 0 |
| Anchors ok/failed | DB: `SELECT state, COUNT(*) FROM records GROUP BY state`| failed > 5% |
| Health check | `GET /v1/health` | degraded > 5 min |
