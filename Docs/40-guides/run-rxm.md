# ⚖️ Run Res ex Machina — Step-by-Step Guide

## 🆕 First time (complete installation)

### 1. Clone the repository

```bash
cd ~/Documentos/ANTIGRAVITY
git clone https://github.com/Sebas-Solver/Res-ex-Machina.git
cd Res-ex-Machina
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create configuration file

```bash
cp .env.example .env
```

> No need to modify anything in `.env` for local development. Default values already point to Docker services.

### 4. Start infrastructure services

```bash
docker compose up -d postgres redis anvil
```

This spins up 3 containers:

| Service | Port | What it's for |
|---|---|---|
| **PostgreSQL**| 5432 | Records and webhooks database |
| **Redis** | 6379 | Job queue (BullMQ) and rate limiting |
| **Anvil** | 8545 | Local test blockchain |

> ⏳ The first time taking a few minutes to download Docker images.

### 5. Create database tables

```bash
npx drizzle-kit push
```

### 6. Start the API

```bash
npm run dev
```

When you see this message, the API is ready:

```
⚖️  Res ex Machina API listening on port 3000
```

### 7. Verify everything works

In **another terminal** (without closing the previous one):

```bash
curl -s http://localhost:3000/v1/health | python3 -m json.tool
```

You should see the 3 checks as `"ok"`:

```json
{
    "status": "ok",
    "checks": {
        "database": { "status": "ok" },
        "redis": { "status": "ok" },
        "blockchain": { "status": "ok" }
    }
}
```

✅ **Done! Res ex Machina is running.**

---

## 🔄 Subsequent times (everything is already installed)

### Start everything

```bash
cd ~/Documentos/ANTIGRAVITY/Res-ex-Machina

# 1. Bring up Docker services
docker compose up -d postgres redis anvil

# 2. Start the API
npm run dev
```

### Stop everything

```bash
# Stop the API → Ctrl+C in the running terminal

# Stop Docker services
cd ~/Documentos/ANTIGRAVITY/Res-ex-Machina
docker compose down
```

> 💡 Use `docker compose down` for containers. PostgreSQL and Redis data are preserved between restarts thanks to Docker volumes.

---

## 🧪 Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | Start API in development mode (hot reload) |
| `npm test` | Run the 73 tests |
| `npm run test:coverage` | Tests with coverage report |
| `npm run check` | TypeScript + ESLint + Tests (all together) |
| `npm run lint` | Check code style |
| `npm run build` | Compile for production |
| `docker compose logs -f`| View Docker services logs |

---

## ❓ Troubleshooting

**The API says "degraded":**
→ Docker services are not running. Run `docker compose up -d postgres redis anvil`.

**`npm run dev` gives environment variables error:**
→ `.env` file is missing. Run `cp .env.example .env`.

**`npx drizzle-kit push` fails:**
→ PostgreSQL has not started. Run `docker compose up -d postgres` and wait a few seconds.

**Port 3000 is occupied:**
→ The Docker `api` container might be running. Stop it with `docker compose stop api` and use `npm run dev` instead.
