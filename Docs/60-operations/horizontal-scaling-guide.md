# 🔀 Horizontal Scaling Guide — Res ex Machina

> How to separate the API and the Anchor Worker into independent services for production scaling.
> Related: [GitHub Issue #35](https://github.com/Sebas-Solver/Res-ex-Machina/issues/35)

---

## Architecture Overview

```
                  ┌──────────────┐
                  │   Clients    │
                  └──────┬───────┘
                         │ HTTPS
                  ┌──────▼───────┐
                  │  API Server  │  ← Fastify (START_INLINE_WORKER=false)
                  │  (Render #1) │
                  └──────┬───────┘
                         │ Enqueue jobs
                  ┌──────▼───────┐
                  │    Redis     │  ← Upstash (shared)
                  │  (BullMQ)    │
                  └──────┬───────┘
                         │ Dequeue jobs
                  ┌──────▼───────┐
                  │ Anchor Worker│  ← Node.js (START_INLINE_WORKER=false on API)
                  │  (Render #2) │
                  └──────┬───────┘
                         │ Write anchor result
                  ┌──────▼───────┐
                  │  PostgreSQL  │  ← Neon (shared)
                  └──────────────┘
```

## Step-by-Step Deployment

### 1. Configure the API Service (Render Web Service)

Add this environment variable to the existing API service:

```
START_INLINE_WORKER=false
```

This tells the API to **NOT start the anchor worker** inside its own process.

### 2. Create a Background Worker Service (Render Background Worker)

In Render, create a **new Background Worker** service with:

| Setting | Value |
|---|---|
| Name | `rxm-anchor-worker` |
| Build Command | `npm install && npm run build` |
| Start Command | `npm run start:worker` |
| Plan | Starter ($7/mo) or Standard ($25/mo) |

Add the **same environment variables** as the API (`DATABASE_URL`, `REDIS_URL`, `L2_RPC_URL`, etc.).

### 3. Verify

- The API should log: `⚖️  Running in API-only mode (START_INLINE_WORKER=false)`
- The Worker should log: `⚓ Anchor worker started, waiting for jobs...`
- Health check (`/v1/health`) should report all services healthy.

## Scaling Further

- **Multiple workers:** On Docker or Kubernetes, you can run `--scale worker=N` to add more worker replicas. BullMQ distributes jobs automatically.
- **Separate Redis:** For very high throughput, consider a dedicated Redis instance instead of serverless Upstash.
- **Region optimization:** Deploy API close to users, workers close to the L2 RPC node.
