# Roadmap

_Updated 2026-10-03. Replaces the roadmap section of the README._

## Where the project stands

A working prototype on Base Sepolia: signed Proof of Generation (EIP-712), fee verification, anchoring, receipts, SDK and MCP server. The hosted API is offline and several security and payment issues are open. Nothing here should be used in production.

## Direction

1. **Honest baseline.** Withdraw the August "approved for production" verdict, fix license metadata, enable private vulnerability reporting and Dependabot, protect `main`. _(in progress)_
2. **Become a profile of an open standard.** Redesign the Proof of Generation as a **signed-declaration profile** of the anchoring draft [ERC-8263](https://github.com/ethereum/ERCs/pull/1748):
   - `proofHash` = the EIP-712 digest of the full declaration (model, runtime, process, nonce, timestamp);
   - the agent's signature travels in `aux`, so anyone can recover the signer from chain data alone;
   - a real `chainId` and the anchoring contract as `verifyingContract` in the signing domain;
   - agent identity through ERC-8004 records or CAIP-10 account URIs.
3. **Verification without trusting the operator.** A strict verifier (CLI and static web page) that checks the event, the signer and the content hash using chain state only.
4. **Fix before reopening the hosted API.** Payment binding and normalisation, verifier correctness, webhook URL validation and rate limiting.

## Progress

| Step | State | Where |
|---|---|---|
| Honest baseline (erratum, license, SECURITY.md, Dependabot, branch rules, CodeQL) | Done | #67 |
| rxm-pog-v2 specification with verified test vectors | Done | `spec/rxm-pog-v2.md`, #87 |
| Core package `@res-ex-machina/pog`: sign and verify from chain state only | Done | `packages/pog`, #90 |
| Anchoring contract `RxMAnchor` (ERC-8263-compatible, stateless) + e2e on a local chain | Done | #92 |
| One package manager (pnpm) for CI and Docker | Done | #93 |
| v2 API: `POST/GET /v2/declarations`, relayer with quotas, idempotent anchoring | Done (API not deployed) | #94 |
| `rxm-verify` CLI and receipt verification | Done | #95 |
| Web verifier on GitHub Pages (`/verify/`) | Done — https://sebas-solver.github.io/Res-ex-Machina/verify/ | #96 |
| v2 client (`RxMClient`) | Done | #97 |
| Least-privilege CI token; e2e of contract, CLI and v2 pipeline on a local chain in CI | Done | #100, #94, #95 |
| Deploy `RxMAnchor` on Base Sepolia | Waiting for a funded deployer account | #98 |

The v2 format does not depend on ERC-8263 being finalised: the declaration and its signature are the core, and anchoring is a replaceable binding (spec §2.1).

## Frozen until further notice

x402/USDC payments, write mode in the MCP server, batch endpoint, new webhook features, Python SDK and the former v3 items (TEE, Kleros, marketplace).

## Language

Res ex Machina records **declarations**: a key signed a statement about a content hash, and that statement existed no later than a given block. It does not prove which model generated the content, nor that an AI generated it.
