# Security Policy — Res-ex-Machina MCP Server

## Architecture

This MCP server follows a **read-only by default** security model:

| Mode | Requirements | Tools Available |
|------|-------------|-----------------|
| **Read-only** (default) | None | `hash`, `verify_hash`, `verify_content`, `get_receipt` |
| **Read-only + wallet** | `MCP_WALLET_ADDRESS` | Above + `get_wallet_balance` |
| **Read-write** | `MCP_ENABLE_WRITE_TOOLS=true` + `MCP_PRIVATE_KEY` | Above + `prepare`, `confirm`, `set_confirmation_mode` |
| **Batch** | Above + `MCP_ENABLE_BATCH_TOOLS=true` | Above + `prepare_batch`, `confirm_batch` |

### Key Isolation (Crypto Sidecar)

Private key material is isolated in a closure-based sidecar module (`crypto-sidecar.ts`).
The key is **never** accessible to tools, the MCP model, or global state after initialization.
Environment variables containing secrets (`MCP_PRIVATE_KEY`, `MCP_HTTP_AUTH_TOKEN`) are
**sanitized from `process.env`** immediately after being read.

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it responsibly:

1. **DO NOT** open a public GitHub issue.
2. Email: `sebas.solver@gmail.com` with subject `[SECURITY] RxM MCP`.
3. Include: description, reproduction steps, impact assessment.
4. We aim to respond within 48 hours and patch within 7 days.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.2.x   | ⚠️ Experimental — development/testnet only |
| 0.1.x   | ❌ Deprecated |

## Security Controls

### Financial Guardrails
- Maximum fee per transaction: `MCP_MAX_RXM_FEE_WEI` (default: 0.01 ETH)
- Maximum gas cost: `MCP_MAX_GAS_COST_WEI` (default: 0.0005 ETH)
- Maximum daily spend: `MCP_MAX_SPEND_PER_DAY_WEI` (default: 0.05 ETH)
- Maximum records per day: `MCP_MAX_RECORDS_PER_DAY` (default: 20)
- Batch size cap: `MCP_MAX_BATCH_SIZE` (default: 10, max: 100)

### Mainnet Protection
- Mainnet chain IDs (1, 8453, 10, 42161) are **blocked by default**.
- Requires explicit `MCP_ALLOW_MAINNET=true` to use mainnet chains.

### Auto-Mode Protection
- `auto` confirmation mode is **disabled by default**.
- Requires `MCP_ALLOW_AUTO_MODE=true` **and** a mandatory reason string.
- All mode changes are recorded in the audit ledger.

### HTTP Transport Security
- Remote HTTP connections blocked by default (`MCP_ALLOW_REMOTE_HTTP=false`).
- Write tools over HTTP **require** `MCP_HTTP_AUTH_TOKEN`.
- Request body limited to 64KB to prevent memory exhaustion.
