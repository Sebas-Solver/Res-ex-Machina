// SPDX-License-Identifier: Apache-2.0
/**
 * Crypto Sidecar — Isolated cryptographic identity module.
 *
 * Security model:
 *   - Private key material lives ONLY inside this module (closure-based).
 *   - Tools import helper functions, never the raw key.
 *   - For testnet: in-memory closure is the best we can do in Node.js.
 *   - For mainnet: migrate to TEE/KMS sidecar (out of scope for alpha).
 *
 * Identity model (CONFLICTO-2 / OP-4):
 *   - Read-only agents use MCP_WALLET_ADDRESS as identity (no key needed).
 *   - If neither key nor address is set, zero-address = anonymous agent.
 */

import { createWalletClient, createPublicClient, http, type PublicClient, type WalletClient } from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';
import { RxMClient } from '@res-ex-machina/sdk';
import { getConfig, consumePrivateKey } from './config.js';
import { logger } from './logger.js';

// ─── Closure-based key isolation ───────────────────────────────
let _account: PrivateKeyAccount | undefined;
let _publicAddress: string | undefined;
let _writeCapable = false;

let _publicClient: PublicClient;
let _walletClient: WalletClient | undefined;
let _rxmClient: RxMClient;

/**
 * Initialize the crypto sidecar. Must be called once before tool registration.
 * After this call, the private key is NOT accessible outside this module.
 */
export function initCryptoSidecar(): void {
  const config = getConfig();
  const transport = http(config.MCP_RPC_URL);
  const chain = baseSepolia;

  // Public client is always available (read-only operations)
  _publicClient = createPublicClient({ chain, transport });

  // CTO Blocker 1: Consume the private key — wipes it from cachedConfig.
  // After this call, the key exists ONLY in this closure scope.
  const privateKey = consumePrivateKey();

  if (privateKey && config.MCP_ENABLE_WRITE_TOOLS) {
    // ── Write-capable mode ──
    _account = privateKeyToAccount(privateKey);
    _publicAddress = _account.address;
    _writeCapable = true;

    _walletClient = createWalletClient({
      account: _account,
      chain,
      transport,
    });

    _rxmClient = new RxMClient({
      account: _account,
      rpcUrl: config.MCP_RPC_URL,
      apiUrl: config.MCP_API_URL,
      feeReceiverAddress: (config.MCP_FEE_RECEIVER_ADDRESS || '0x0000000000000000000000000000000000000000') as `0x${string}`,
    });

    logger.info('Crypto sidecar: write-capable, key consumed and sanitized');
  } else {
    // ── Read-only mode ──
    if (privateKey && !config.MCP_ENABLE_WRITE_TOOLS) {
      // Key present but write tools disabled — derive address only, then discard key
      const tempAccount = privateKeyToAccount(privateKey);
      _publicAddress = tempAccount.address;
      // tempAccount goes out of scope here — key not stored
    } else if (config.MCP_WALLET_ADDRESS) {
      // CONFLICTO-2 fix: read-only agents use configured wallet address
      _publicAddress = config.MCP_WALLET_ADDRESS;
    }

    // CTO Blocker 2: Use SDK's native readOnly mode.
    // No pseudo-account, no `as any` — proper read-only client.
    _rxmClient = new RxMClient({
      readOnly: true,
      apiUrl: config.MCP_API_URL,
    });

    logger.info('Crypto sidecar: read-only', {
      hasAddress: !!_publicAddress,
      addressSource: config.MCP_WALLET_ADDRESS ? 'MCP_WALLET_ADDRESS' : (_publicAddress ? 'derived' : 'anonymous'),
    });
  }
}

// ─── Public API (no key material exposed) ─────────────────────

/** The public wallet address, if configured. `undefined` = anonymous agent. */
export function getPublicAddress(): string | undefined {
  return _publicAddress;
}

/** Whether the sidecar has signing capability. */
export function isWriteCapable(): boolean {
  return _writeCapable;
}

/** Whether a wallet address is configured (either from key or MCP_WALLET_ADDRESS). */
export function hasWallet(): boolean {
  return _publicAddress !== undefined;
}

/** The RxM SDK client (read-only or write-capable depending on init). */
export function getRxmClient(): RxMClient {
  return _rxmClient;
}

/** Public Viem client for on-chain reads (balance, etc). */
export function getPublicClient(): PublicClient {
  return _publicClient;
}

/** Wallet client for signing — only available in write mode. */
export function getWalletClient(): WalletClient | undefined {
  return _walletClient;
}
