# Roadmap

_Updated 2026-10-02. Replaces the roadmap section of the README._

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

## Frozen until further notice

x402/USDC payments, write mode in the MCP server, batch endpoint, new webhook features, Python SDK and the former v3 items (TEE, Kleros, marketplace).

## Language

Res ex Machina records **declarations**: a key signed a statement about a content hash, and that statement existed no later than a given block. It does not prove which model generated the content, nor that an AI generated it.
