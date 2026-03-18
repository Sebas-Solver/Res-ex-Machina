# 💰 Production Cost Analysis — Res ex Machina

> Estimated costs and break-even analysis for moving from alpha (free tier) to production.
> Created: March 2026

---

## 1. Infrastructure Costs (Monthly)

| Service | Free Tier (current) | Production (Starter) | Production (Standard) |
|---|---|---|---|
| **Render — API** | $0 (spins down after 15 min) | **$7/mo** (always on, 512 MB) | $25/mo (1 GB, 0.5 CPU) |
| **Render — Worker** (separate, Issue #35) | included inline | **$7/mo** (background worker) | $25/mo |
| **Neon — PostgreSQL** | $0 (0.5 GB, 100 CU-hr/mo) | **~$15/mo** (Launch, pay-per-use) | ~$30/mo (heavier load) |
| **Upstash — Redis** | $0 (500K cmds/mo) | **~$2/mo** (pay-as-you-go) | ~$5/mo |
| **Domain + SSL** | Render subdomain (free) | **~$12/year** (~$1/mo) | Same |
| **Sentry (monitoring)** | $0 (Developer plan) | **$0** (free up to 5K errors/mo) | $26/mo (Team) |
| | | | |
| **TOTAL MONTHLY** | **$0** | **~$32/mo** | **~$112/mo** |

> [!TIP]
> Start with the **Starter tier (~$32/mo)**. It handles up to ~10,000 records/day easily.
> Move to Standard only when latency or queue depth demand it.

---

## 2. Blockchain Costs

### 2.1 Gas Cost per Anchoring Transaction (Base L2 Mainnet)

Each record triggers **one L2 transaction** (a simple transfer with calldata). On Base mainnet:

| Metric | Value |
|---|---|
| Average gas per anchor tx | ~50,000–80,000 gas |
| Base fee (Base L2) | ~0.005 gwei minimum |
| **Cost per anchor tx** | **~$0.001 – $0.005 USD** |
| Pessimistic estimate | $0.01 USD/tx (congestion spikes) |

### 2.2 Initial ETH for the RxM Wallet

The RxM wallet (`ANCHOR_WALLET_PRIVATE_KEY`) pays gas for each anchoring transaction. This is a **separate cost** from the fee paid by users.

| Scenario | Records/month | Gas cost/month | Recommended initial ETH |
|---|---|---|---|
| **Launch** (low traffic) | 100–500 | $0.10 – $2.50 | **0.01 ETH (~$25)** |
| **Growth** (medium traffic) | 1,000–5,000 | $1 – $25 | **0.05 ETH (~$125)** |
| **Scale** (high traffic) | 10,000–50,000 | $10 – $250 | **0.2 ETH (~$500)** |

> [!NOTE]
> ETH prices estimated at ~$2,500/ETH. Adjust accordingly.
> On Base L2, gas is extremely cheap. Even 0.01 ETH can cover thousands of transactions.

---

## 3. Total Investment to Launch Production

| Item | One-time | Monthly |
|---|---|---|
| Initial ETH for RxM wallet (0.01 ETH) | **~$25** | — |
| Domain name (optional) | $12/year | ~$1 |
| Infrastructure (Starter tier) | — | **~$32** |
| | | |
| **TOTAL (first month)** | | **~$58** |
| **TOTAL (subsequent months)** | | **~$33** |

---

## 4. Fee Revenue Model — When Does the Wallet Become Self-Sustaining?

### How the fee flow works today

1. **User pays a fee** in ETH → sent to `FEE_RECEIVER_ADDRESS` (your wallet).
2. **RxM wallet pays gas** from its own balance to anchor the record on-chain.
3. The fee received **stays in the FEE_RECEIVER wallet** — it is NOT automatically forwarded to the RxM anchoring wallet.

### Break-even point

The wallet becomes self-sustaining when **fee income ≥ gas costs + infrastructure costs**.

| Variable | Value |
|---|---|
| Minimum fee per record (`FEE_MINIMUM_AMOUNT`) | 0.0001 ETH ($0.25) |
| Gas cost per anchor | ~$0.005 |
| **Net profit per record** | **~$0.245** |
| Infrastructure cost/month | ~$32 |
| **Records needed to cover infra** | **~131 records/month** |
| **Records needed to also cover initial ETH** | adds ~102 records (first month only) |

### Self-sustaining timeline

| Phase | Records/month | Monthly fee income | Monthly gas cost | Monthly profit | Self-sustaining? |
|---|---|---|---|---|---|
| Month 1 (launch) | 50 | $12.50 | $0.25 | -$19.75 | ❌ No |
| Month 3 (early growth) | 200 | $50.00 | $1.00 | +$17.00 | ✅ **Yes** |
| Month 6 (established) | 1,000 | $250.00 | $5.00 | +$213.00 | ✅ Profitable |
| Month 12 (scaled) | 5,000 | $1,250.00 | $25.00 | +$1,193.00 | ✅ Very profitable |

> [!IMPORTANT]
> **The wallet becomes self-sustaining at approximately 131 records/month** (~4.4 records/day).
> At that point, the fees collected from users cover both the gas costs AND the infrastructure bills.
> 
> To make this automatic, you would need to:
> 1. Set `FEE_RECEIVER_ADDRESS` = the same as the RxM anchoring wallet, **OR**
> 2. Implement a periodic sweep (cron job or script) that transfers accumulated fees from the receiver wallet to the anchoring wallet.

---

## 5. Recommended Launch Strategy

1. **Buy 0.01 ETH on Base mainnet** (~$25) — enough for 2,000+ anchoring transactions.
2. **Upgrade Render to Starter** ($7/mo per service = $14 for API + Worker).
3. **Keep Neon free tier** initially — upgrade to Launch ($15/mo) when storage exceeds 0.5 GB.
4. **Keep Upstash free tier** initially — 500K commands/month is plenty for launch.
5. **Set `FEE_MINIMUM_AMOUNT`** to at least 0.0001 ETH in production (currently 0.01 in dev).
6. **Monitor the RxM wallet balance** via the health endpoint or a simple alert.

**Realistic first-month budget: ~$40–$60 USD total.**
