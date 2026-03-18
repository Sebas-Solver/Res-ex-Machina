# 🚀 Alpha Deploy Guide — Res ex Machina

> Reference document: everything configured on 02/12/2026 to put the API into production.

---

## What have we done?

We moved Res ex Machina from running **only on your computer** (localhost) to being **publicly available on the internet**. Anyone (or AI agent) with the URL can register creations.

**Public URL:** `https://res-ex-machina-api.onrender.com`

---

## Registered Services

These are the 4 cloud services we use. **All are free**.

### 1. Render.com — The API server

| | |
|---|---|
| **What it is** | A cloud service that runs your code and makes it accessible via internet |
| **What it's for** | Running the Res ex Machina API (Fastify server + anchor worker) |
| **Plan** | Free (750 hours/month) |
| **Dashboard URL** | [dashboard.render.com](https://dashboard.render.com) |
| **Your service** | `res-ex-machina-api` (Web Service, Docker) |

**Important things:**
- The free plan **shuts down the server** if it receives no traffic in ~15 minutes. The first request after takes ~30 seconds (called "cold start")
- The server listens on **port 10000** (not 3000 used locally)
- Health Check Path configured as `/` (root route)

---

### 2. Neon — PostgreSQL Database

| | |
|---|---|
| **What it is** | PostgreSQL in the cloud (like having your database on the internet) |
| **What it's for** | Storing all registered records, their hashes, states, etc. |
| **Plan** | Free (0.5 GB storage) |
| **Dashboard URL** | [console.neon.tech](https://console.neon.tech) |
| **Environment Variable**| `DATABASE_URL` (connection URL you put in Render) |

**Important things:**
- Connection uses **SSL** (encrypted), automatically included in URL
- Database schema migrated with `drizzle-kit push`
- If you ever need to view data directly, Neon has an **SQL Editor** in its dashboard

---

### 3. Upstash — Redis Queue

| | |
|---|---|
| **What it is** | Redis in the cloud (ultra-fast database for job queues) |
| **What it's for** | BullMQ queue managing blockchain anchor jobs |
| **Plan** | Free (10,000 commands/day) |
| **Dashboard URL** | [console.upstash.com](https://console.upstash.com) |
| **Environment Variable**| `REDIS_URL` (uses `rediss://` with double S = TLS encrypted connection) |

**Important things:**
- Upstash requires **TLS** (encrypted connection) — therefore URL starts with `rediss://` instead of `redis://`
- Also requires **password** — included in URL
- We had to update 3 code files to support this: `queue.ts`, `anchor.worker.ts`, and `health.ts`

---

### 4. Base Sepolia — Test Blockchain

| | |
|---|---|
| **What it is** | Testnet of Base, an L2 blockchain by Coinbase |
| **What it's for** | Anchoring record hashes on blockchain (immutability) |
| **Plan** | Free (it's a testnet, ETH has no real value) |
| **RPC URL** | `https://sepolia.base.org` |
| **Chain ID** | `84532` |
| **Explorer** | [sepolia.basescan.org](https://sepolia.basescan.org) |

**Important things:**
- Testnet ETH is free and obtained from **faucets**
- Your **test user** wallet has funds to pay fees
- The **RxM** wallet (which anchors) needs funds to pay gas → use a faucet like [Alchemy](https://www.alchemy.com/faucets/base-sepolia)

---

## Environment Variables in Render

These are **all** variables you configured in Render → Environment:

| Variable | Value | What it does |
|---|---|---|
| `PORT` | `10000` | Port API listens to (Render requires it) |
| `NODE_ENV` | `production` | Production mode (activates inline worker by default) |
| `START_INLINE_WORKER` | `true` (default) | Set to `false` if deploying the worker as a separate service for horizontal scaling |
| `LOG_LEVEL` | `info` | Log level |
| `DATABASE_URL` | `postgresql://...@...neon.tech/...` | Neon Database connection |
| `REDIS_URL` | `rediss://default:...@...upstash.io:6379` | Upstash Redis connection (TLS) |
| `L2_RPC_URL` | `https://sepolia.base.org` | Blockchain node URL |
| `L2_CHAIN_ID` | `84532` | Base Sepolia chain ID |
| `FEE_RECEIVER_ADDRESS` | `0x...` | Address receiving fees |
| `FEE_MINIMUM_AMOUNT` | `0.0001` | Minimum ETH fee (low for testnet) |
| `FEE_TX_MAX_AGE_HOURS` | `24` | Maximum payment age in hours |
| `ANCHOR_WALLET_PRIVATE_KEY`| `0x...` (secret) | Anchoring wallet private key |

> [!CAUTION]
> The `ANCHOR_WALLET_PRIVATE_KEY` is **secret**. Never share it or put it in code. Render keeps it encrypted.

---

## Changes made to the code

| File | What changed | Why |
|---|---|---|
| `src/services/queue.ts` | Added TLS and password to Redis | Upstash requires encrypted connection |
| `src/workers/anchor.worker.ts`| Added TLS and password to Redis | Same reason |
| `src/routes/health.ts` | Added TLS and password to Redis | Health check also connects to Redis |
| `src/app.ts` | Inline worker in production | Render free plan lacks separate workers |
| `.env.example` | Documented cloud options | Reference for future developers |
| `CHANGELOG.md` | New alpha.1 section | Changelog |
| `README.md` | Badges, URL, roadmap | Reflect current project status |

---

## Problems encountered and solutions

### 1. Incorrect Port
- **Problem:** Render uses port 10000, we had 3000
- **Solution:** Change `PORT=10000` in Render → Environment

### 2. Redis without TLS
- **Problem:** Upstash requires `rediss://` (TLS), our code only supported `redis://`
- **Solution:** Update Redis connections in 3 files to detect `rediss://` and enable TLS

### 3. Health check failed → deploy failed
- **Problem:** Health check created its own Redis connection without TLS → failed → returned 503 → Render thought app was dead
- **Solution:** Fix health check + change Health Check Path to `/` as safe fallback

---

## How to verify everything works

Open in browser:

1. **`https://res-ex-machina-api.onrender.com/`** — Should show welcome JSON
2. **`https://res-ex-machina-api.onrender.com/v1/health`** — Should show all 3 checks as "ok"

---

## Next Steps

1. **Get testnet ETH** for RxM wallet (Base Sepolia faucet)
2. **Complete test:** Send a fee → create record → verify anchoring
3. **Monitor:** Review Logs in Render → Logs if something fails

---

*Document created 02/12/2026 during alpha v1.0.0-alpha.1 deploy*
