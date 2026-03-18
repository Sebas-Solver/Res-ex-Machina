import type { FastifyRequest } from 'fastify';
import { verifyMessage, type Hex, type Address } from 'viem';
import {
    missingAuthHeaders,
    invalidWalletAddress,
    authTimestampExpired,
    authSignatureInvalid,
} from '../utils/errors.js';

/**
 * Authentication timestamp validity window (5 minutes).
 * Prevents replay attacks: a signature is only valid for 5 min.
 */
const AUTH_WINDOW_MS = 5 * 60 * 1000;

/** Authentication message prefix */
const AUTH_MESSAGE_PREFIX = 'RexAuth:';

/** Regex to validate Ethereum address format */
const WALLET_REGEX = /^0x[a-fA-F0-9]{40}$/;

/**
 * Fastify request extension to include the authenticated wallet.
 * Injected after passing signature verification.
 */
declare module 'fastify' {
    interface FastifyRequest {
        authenticatedWallet?: string;
    }
}

/**
 * Wallet signature authentication middleware (EIP-191).
 *
 * Flow:
 * 1. The agent signs `RexAuth:{ISO_timestamp}` with its private key
 * 2. Sends wallet + signature + timestamp in headers
 * 3. This middleware verifies the signature matches the wallet
 * 4. If valid → injects `request.authenticatedWallet`
 * 5. If not → throws ApiError 401
 *
 * Required headers:
 *   X-Wallet-Address: 0x... (agent address)
 *   X-Signature: 0x... (EIP-191 message signature)
 *   X-Timestamp: ISO 8601 timestamp
 */
export async function walletAuth(request: FastifyRequest): Promise<void> {
    const walletAddress = request.headers['x-wallet-address'] as string | undefined;
    const signature = request.headers['x-signature'] as string | undefined;
    const timestamp = request.headers['x-timestamp'] as string | undefined;

    // 1. Verify headers exist
    if (!walletAddress || !signature || !timestamp) {
        throw missingAuthHeaders();
    }

    // 2. Validate wallet format
    if (!WALLET_REGEX.test(walletAddress)) {
        throw invalidWalletAddress();
    }

    // 3. Validate timestamp (5 min window)
    const requestTime = new Date(timestamp).getTime();
    if (isNaN(requestTime)) {
        throw authTimestampExpired();
    }

    const now = Date.now();
    if (Math.abs(now - requestTime) > AUTH_WINDOW_MS) {
        throw authTimestampExpired();
    }

    // 4. Reconstruct message and verify signature
    const message = `${AUTH_MESSAGE_PREFIX}${timestamp}`;

    try {
        const isValid = await verifyMessage({
            address: walletAddress as Address,
            message,
            signature: signature as Hex,
        });

        if (!isValid) {
            throw authSignatureInvalid();
        }
    } catch (error) {
        // Re-throw if already an ApiError
        if (error instanceof Error && error.name === 'ApiError') {
            throw error;
        }
        // viem error (malformed signature, etc.)
        throw authSignatureInvalid();
    }

    // 5. Inject authenticated wallet into the request
    request.authenticatedWallet = walletAddress.toLowerCase();
}
