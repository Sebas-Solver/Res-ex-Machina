# Alpha Pilot Plan — Res ex Machina

## Objective

Validate in 2 weeks that the system works under **real conditions** with external agents.

## Participants

| Agent | Type | Stack | Responsible |
|---|---|---|---|
| **A** (ours) | Happy path, burst | TypeScript + viem | Core team |
| **B** (dev friend) | Scratch integration | TypeScript (following docs) | Integrator 1 |
| **C** (other stack) | Compatibility | Python (eth_account) or Go | Integrator 2 |
| **D** (adversarial) | Attack | TypeScript | Core team |

---

## Setup for integrators (B and C)

### 1. Clone and start

```bash
git clone https://github.com/Sebas-Solver/Res-ex-Machina.git
cd Res-ex-Machina
cp .env.example .env
docker compose up -d
npm install && npm run db:push
npm run dev          # terminal 1
npm run worker:anchor  # terminal 2
```

### 2. Verify everything works

```bash
curl http://localhost:3000/v1/health | jq
# → status: "ok"
```

### 3. Read the docs

- **Complete API**: `Docs/api-examples.md`
- **Verify offline**: `Docs/verify-pog-offline.md`
- **Errors**: `Docs/10-specs/error-catalog.md`

### 4. Create your first record

Follow the steps in `Docs/api-examples.md`:

1. Generate wallet (viem, ethers, eth_account in Python)
2. Calculate SHA-256 of your content
3. Sign PoG with EIP-712
4. Send fee tx on Base Sepolia (0.0001 ETH minimum for alpha; 0.01 ETH for local Anvil)
5. POST /v1/records
6. Wait anchoring
7. GET /verify + /export

---

## Mandatory scenarios (acceptance tests)

| # | Scenario | Criterion | Script |
|---|---|---|---|
| 1 | Burst 20 records in a row | 0 failures, p95 < 3s | `agent-a-happy-path.ts` |
| 2 | Same duplicated content_hash| 409 with record_id | `agent-d-adversarial.ts` |
| 3 | Nonce replay (same wallet) | 409 anti-replay | `agent-d-adversarial.ts` |
| 4 | Invalid fee tx | 402 fee_not_verified / fee_insufficient | `agent-d-adversarial.ts` |
| 5 | Worker down 30 min | Accepts receipts, anchors upon return | **Manual** |
| 6 | RPC/anchoring failure | anchor_failed + export ok | **Manual** |

### Manual test: Worker down (scenario 5)

```bash
# 1. Create 5 records (without worker)
# 2. Verify state = pending_anchor
curl http://localhost:3000/v1/records/<id> | jq .state
# → "pending_anchor"

# 3. Wait 30 min
# 4. Start worker
npm run worker:anchor

# 5. Verify all are anchored
curl http://localhost:3000/v1/records/<id> | jq .state
# → "anchored"

# 6. Verify NO duplication
# → Only 1 anchor tx per record (check DB)
```

### Manual test: RPC failure (scenario 6)

```bash
# 1. Stop Anvil
docker compose stop anvil

# 2. Create records → must be created (state: pending_anchor)
# 3. Verify /export still works
curl http://localhost:3000/v1/records/<id>/export | jq

# 4. Start Anvil
docker compose start anvil

# 5. Worker resumes and anchors with backoff
```

---

## Metrics at pilot end

| Metric | Target | How to measure |
|---|---|---|
| p95 POST /records | < 3000ms | Output of `agent-a-happy-path.ts` |
| Median anchoring | < 5 min | Check timestamps DB |
| Anchor success rate | > 99% | `SELECT state, count(*) FROM records GROUP BY state` |
| Broken invariants | 0 | CI pipeline |
| Signature bugs by alg. | Document | Feedback B and C |

---

## Go/No-Go Criterion

Following alpha, `git tag v1.0.0` can be made if:

- [x] Green CI (tests + invariants)
- [x] /health OK (api + db + redis + rpc)
- [x] Idempotent worker + retries
- [ ] **Alpha:** 0 broken invariants
- [ ] **Alpha:** p95 < 3s
- [ ] **Alpha:** Anchor success > 99%
- [ ] **Alpha:** At least 1 external integrator completed flow

If they do not pass → `v1.0.0-rc2` with fixes.
