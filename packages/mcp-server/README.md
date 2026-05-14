<p align="center">
  <img src="../../docs/assets/Logo%20lazo%20-%20RxM.png" width="300" alt="Res ex Machina Logo" /><br/>
  <strong>@res-ex-machina/mcp-server</strong><br/>
  <em>Secure sidecar for AI agents — register Proofs of Generation via MCP</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/MCP-compatible-blue" alt="MCP Compatible"/>
  <img src="https://img.shields.io/badge/transport-stdio%20%7C%20SSE-green" alt="Transport: stdio | SSE"/>
  <img src="https://img.shields.io/badge/chain-Base%20Sepolia-purple" alt="Chain: Base Sepolia"/>
  <img src="https://img.shields.io/badge/license-Apache%202.0-lightgrey" alt="License: Apache 2.0"/>
</p>

---

## What is this?

An **MCP (Model Context Protocol) Server** that lets AI agents register verifiable **Proofs of Generation** on blockchain through [Res ex Machina](https://github.com/Sebas-Solver/Res-ex-Machina). 

Works with **any MCP-compatible client**: Claude Desktop, Google Antigravity, Cursor, VS Code (Copilot), and more.

---

## Quick Start

```bash
npx @res-ex-machina/mcp-server
```

This starts the server in `stdio` mode (default). No configuration needed for read-only tools.

---

## Client Configuration

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "res-ex-machina": {
      "command": "npx",
      "args": ["-y", "@res-ex-machina/mcp-server"],
      "env": {
        "MCP_TRANSPORT": "stdio",
        "MCP_API_URL": "https://res-ex-machina-api.onrender.com/v1"
      }
    }
  }
}
```

### Google Antigravity

Add to your MCP server configuration:

```json
{
  "mcpServers": {
    "res-ex-machina": {
      "command": "npx",
      "args": ["-y", "@res-ex-machina/mcp-server"],
      "env": {
        "MCP_TRANSPORT": "stdio"
      }
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "res-ex-machina": {
      "command": "npx",
      "args": ["-y", "@res-ex-machina/mcp-server"],
      "env": {
        "MCP_TRANSPORT": "stdio"
      }
    }
  }
}
```

### VS Code (GitHub Copilot)

Add to your VS Code `settings.json`:

```json
{
  "github.copilot.chat.mcpServers": {
    "res-ex-machina": {
      "command": "npx",
      "args": ["-y", "@res-ex-machina/mcp-server"],
      "env": {
        "MCP_TRANSPORT": "stdio"
      }
    }
  }
}
```

### SSE (Remote / Docker)

For remote deployments (e.g. shared team server):

```bash
MCP_TRANSPORT=sse \
MCP_HTTP_AUTH_TOKEN=your_secret_token \
MCP_HTTP_PORT=8787 \
npx @res-ex-machina/mcp-server
```

Connect via: `http://localhost:8787/sse`

---

## Available Tools

### 🔓 Read-Only (always available)

| Tool | Description |
|---|---|
| `rxm_hash_content` | Calculate SHA-256 content hash |
| `rxm_verify_hash` | Verify on-chain status of a hash |
| `rxm_verify_content` | Hash content and verify status |
| `rxm_get_wallet_balance` | Check agent wallet balance and daily allowance |
| `rxm_get_receipt` | Retrieve a record's receipt |
| `rxm_set_confirmation_mode` | Switch between `require`, `auto`, `dry-run` |

### 🔐 Write Tools (require `MCP_ENABLE_WRITE_TOOLS=true` + `MCP_PRIVATE_KEY`)

| Tool | Description |
|---|---|
| `rxm_prepare_record_generation` | Phase 1: Prepare a record (checks, guardrails, confirmation ID) |
| `rxm_confirm_record_generation` | Phase 2: Confirm and register on-chain |
| `rxm_record_generation` | Direct registration (only in `auto`/`dry-run` mode) |
| `rxm_prepare_batch` | Prepare multiple records (dedup + cost estimate) |
| `rxm_confirm_batch` | Confirm and register batch |

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `MCP_TRANSPORT` | `stdio` | Transport mode: `stdio` or `sse` |
| `MCP_API_URL` | `https://res-ex-machina-api.onrender.com/v1` | RxM API endpoint |
| `MCP_RPC_URL` | `https://sepolia.base.org` | Blockchain RPC URL |
| `MCP_CHAIN_ID` | `84532` | Chain ID (Base Sepolia) |
| **Auth & Permissions** |
| `MCP_PRIVATE_KEY` | — | Agent wallet private key (hex, `0x...`) |
| `MCP_WALLET_ADDRESS` | — | Read-only wallet address |
| `MCP_ENABLE_WRITE_TOOLS` | `false` | Enable registration tools |
| `MCP_HTTP_AUTH_TOKEN` | — | Bearer token for SSE transport |
| `MCP_ALLOW_REMOTE_HTTP` | `false` | Allow non-localhost SSE connections |
| `MCP_CONFIRMATION_MODE` | `require` | `require` / `auto` / `dry-run` |
| `MCP_PAYMENT_MODE` | `x402` | Payment mode: `legacy` (ETH) or `x402` (USDC) |
| **Financial Guardrails** |
| `MCP_MAX_RXM_FEE_WEI` | `10000000000000000` | Max fee per record (0.01 ETH) |
| `MCP_MAX_SPEND_PER_DAY_WEI` | `50000000000000000` | Max daily spend (0.05 ETH) |
| `MCP_MAX_RECORDS_PER_DAY` | `20` | Max records per day |
| **Content Protection** |
| `MCP_MAX_CONTENT_BYTES` | `65536` | Max content size (64KB) |
| `MCP_ALLOWED_CONTENT_TYPES` | `text/plain,text/markdown,application/json` | Allowed MIME types |
| `MCP_REQUIRE_MODEL_ID` | `true` | Require model ID in registrations |

---

## Security Model

1. **Isolated sidecar** — The LLM only accesses high-level tools, never raw signing methods
2. **Financial guardrails** — Daily spend limits, per-transaction caps, record counters
3. **Two-phase confirmation** — `prepare` → human review → `confirm` (default mode)
4. **Auth token** — Required for SSE transport when write tools are enabled
5. **Mainnet protection** — Mainnet chain IDs blocked unless explicitly enabled
6. **No key storage** — Private keys are injected via environment variables only

---

## Architecture

```
┌─────────────────┐     stdio/SSE     ┌──────────────────────┐
│   MCP Client    │◄──────────────────►│   RxM MCP Server     │
│  (Claude, etc)  │                    │                      │
└─────────────────┘                    │  ┌────────────────┐  │
                                       │  │ Financial      │  │
                                       │  │ Guardrails     │  │
                                       │  │ (SQLite ledger)│  │
                                       │  └────────────────┘  │
                                       │          │           │
                                       │  ┌───────▼────────┐  │
                                       │  │ @rxm/sdk       │  │
                                       │  │ (EIP-712, x402)│  │
                                       │  └───────┬────────┘  │
                                       └──────────┼──────────┘
                                                  │
                                       ┌──────────▼──────────┐
                                       │   RxM REST API      │
                                       │   (Render + Neon)    │
                                       └──────────┬──────────┘
                                                  │
                                       ┌──────────▼──────────┐
                                       │   Base Sepolia L2   │
                                       │   (on-chain anchor) │
                                       └─────────────────────┘
```

---

## Development

```bash
# Clone the monorepo
git clone https://github.com/Sebas-Solver/Res-ex-Machina.git
cd Res-ex-Machina/packages/mcp-server

# Install dependencies
npm install

# Build
npm run build

# Run locally
npm start

# Run tests
npm test
```

---

## Related

- [Res ex Machina](https://github.com/Sebas-Solver/Res-ex-Machina) — Main project
- [@res-ex-machina/sdk](https://www.npmjs.com/package/@res-ex-machina/sdk) — TypeScript SDK
- [MCP Specification](https://modelcontextprotocol.io/) — Model Context Protocol

---

## License

Apache 2.0 — see [LICENSE](../../LICENSE)
