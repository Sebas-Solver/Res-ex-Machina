# 🧪 Test Res ex Machina in 5 minutes

> Quick start guide for developers who want to test the API.
>
> **⚠️ Alpha version** — Base Sepolia Testnet. Data may be wiped.

---

## Prerequisites

| Requirement | What you need |
|-----------|---------------|
| **Node.js** | v20 or higher ([download](https://nodejs.org/)) |
| **Ethereum Wallet**| A test wallet's private key (never use your real wallet) |
| **Testnet ETH** | Free from Base Sepolia faucet |

> ⚠️ **NEVER use a funded wallet.** Create a new wallet just for tests. You can use MetaMask or any generator.

---

## Step 1: Get testnet ETH (free)

Registration fee costs ~$0.01 in Base Sepolia (testnet, ETH has no real value).

1. Go to **[Optimism Console (Superchain Faucet)](https://console.optimism.io/faucet)**
2. Connect wallet or paste address
3. Select **Base Sepolia** network
4. Click "Claim" for test ETH
5. Receive ETH in ~30 seconds

> **Alternative:** [Coinbase Base Sepolia Faucet](https://portal.cdp.coinbase.com/products/faucet)

---

## Step 2: Run E2E test (recommended option)

### 2a. Clone repository

```bash
git clone https://github.com/Sebas-Solver/Res-ex-Machina.git
cd Res-ex-Machina
npm install
```

### 2b. Configure wallet

Create a `.env` file in project root:

```env
TEST_AGENT_PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE
```

### 2c. Run test

```bash
npm run alpha:happy
```

Script runs automatically:
1. ✅ Verifies API is online
2. 💰 Checks balance
3. 💸 Pays fee on Base Sepolia
4. ✍️ Signs PoG bundle with EIP-712
5. 🚀 Creates API record
6. ⚓ Waits for anchor (~30s)
7. 📋 Exports verifiable receipt
8. 🔍 Verifies by content_hash

### Expected Output

```
═══════════════════════════════════════════
  🧪 Test E2E — Res ex Machina Alpha
═══════════════════════════════════════════

🔑 Agent wallet: 0xYOUR_WALLET...
📡 Step 0: Verifying API online...
   ✅ API OK (DB: 12ms, Redis: 8ms, Blockchain: 150ms)

💸 Step 3: Sending 0.0002 ETH fee...
   ✅ Confirmed in block 12345678

🚀 Step 5: Sending API record...
   ✅ Record successfully created!

⚓ Step 6: Waiting for anchor...
   ✅ ANCHORED ON BLOCKCHAIN!
   🔗 Tx: https://sepolia.basescan.org/tx/0x...
```

---

## Step 3: Manual manual testing with curl (alternative)

If you prefer testing endpoints manually:

### Health check
```bash
curl https://YOUR_API_URL/v1/health
```

### Query an existing record
```bash
# Replace :id with real record_id
curl https://YOUR_API_URL/v1/records/:id
```

### Verify by hash
```bash
curl "https://YOUR_API_URL/v1/records/verify?content_hash=sha256:abc123..."
```

### Export receipt
```bash
# Full mode
curl https://YOUR_API_URL/v1/records/:id/export

# Compact mode (only verification fields)
curl "https://YOUR_API_URL/v1/records/:id/export?mode=compact"
```

> **Note:** POST records require EIP-712 signatures. Use `npm run alpha:happy` or included Postman collection.

---

## Step 4: Import Postman collection (optional)

1. Open Postman
2. Click **Import** > **File**
3. Select `Docs/postman-collection.json` from repo
4. GET endpoints work directly
5. For POST, configure collection variables

---

## Quick Reference API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/health` | GET | System status |
| `/v1/records` | POST | Create record |
| `/v1/records` | GET | List records per wallet (filters, pagination) |
| `/v1/records/batch` | POST | Create up to 100 records per call |
| `/v1/records?wait_for_anchor=true` | POST | Create + wait anchor (max 25s) |
| `/v1/records/:id` | GET | Query record |
| `/v1/records/mine` | GET | My records (requires walletAuth EIP-191) |
| `/v1/records/verify?content_hash=` | GET | Verify by hash |
| `/v1/records/:id/export` | GET | Full export |
| `/v1/records/:id/export?mode=compact` | GET | Compact export |
| `/v1/webhooks` | POST | Register webhook (requires walletAuth) |
| `/v1/webhooks` | GET | List own webhooks |
| `/v1/webhooks/:id` | DELETE | Deactivate webhook |

**Base URL:** See project deployment docs for the current API endpoint.

> ⚠️ Free-tier instances may sleep after inactivity. First call may take ~30s to wake.

---

## alpha.2 Updates

| Feature | What it does |
|---------|----------|
| `wait_for_anchor=true` | Wait block chain anchoring up to 25s per call |
| `state_info` | Response includes `terminal`, `retryable` and `description` |
| `explorer_url` | Direct BaseScan/Etherscan links in `anchor` and `fee` |
| `mode=compact` | Reduced export format for AI agents (saves tokens) |

---

## Troubleshooting

| Error | Cause | Solution |
|-------|-------|----------|
| `ECONNREFUSED` | API is asleep (Render free tier) | Wait ~30s and retry |
| `fee_not_verified` | Fee tx is unconfirmed | Wait few seconds and retry |
| `rate_limit_exceeded`| Too many requests | Wait `Retry-After` seconds |
| `insufficient balance`| No ETH in Base Sepolia | Faucet (step 1) |
| `duplicate_content_hash`| Registered content | Expected if same content run twice |

---

## Need help?

- 📖 [Complete Developer Guide](./developer-guide-v1.md)
- 🔐 [Receipt Verification Spec](./receipt-verification-spec.md)
- 📝 [Human Guide](./human-guide-v1.md)
- 🐛 [Open a GitHub issue](https://github.com/Sebas-Solver/Res-ex-Machina/issues)
