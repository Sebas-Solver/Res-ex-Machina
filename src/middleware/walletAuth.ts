import type { FastifyRequest } from 'fastify';
import { verifyMessage, type Hex, type Address } from 'viem';
import {
    missingAuthHeaders,
    invalidWalletAddress,
    authTimestampExpired,
    authSignatureInvalid,
} from '../utils/errors.js';

/**
 * Ventana de validez del timestamp de autenticación (5 minutos).
 * Previene replay attacks: una firma solo es válida durante 5 min.
 */
const AUTH_WINDOW_MS = 5 * 60 * 1000;

/** Prefijo del mensaje de autenticación */
const AUTH_MESSAGE_PREFIX = 'RexAuth:';

/** Regex para validar formato de dirección Ethereum */
const WALLET_REGEX = /^0x[a-fA-F0-9]{40}$/;

/**
 * Extensión del request de Fastify para incluir la wallet autenticada.
 * Se inyecta después de pasar la verificación de firma.
 */
declare module 'fastify' {
    interface FastifyRequest {
        authenticatedWallet?: string;
    }
}

/**
 * Middleware de autenticación por firma de wallet (EIP-191).
 *
 * Flujo:
 * 1. El agente firma `RexAuth:{ISO_timestamp}` con su clave privada
 * 2. Envía wallet + firma + timestamp en headers
 * 3. Este middleware verifica que la firma corresponde a la wallet
 * 4. Si es válida → inyecta `request.authenticatedWallet`
 * 5. Si no → lanza ApiError 401
 *
 * Headers requeridos:
 *   X-Wallet-Address: 0x... (dirección del agente)
 *   X-Signature: 0x... (firma EIP-191 del mensaje)
 *   X-Timestamp: ISO 8601 timestamp
 */
export async function walletAuth(request: FastifyRequest): Promise<void> {
    const walletAddress = request.headers['x-wallet-address'] as string | undefined;
    const signature = request.headers['x-signature'] as string | undefined;
    const timestamp = request.headers['x-timestamp'] as string | undefined;

    // 1. Verificar que los headers existen
    if (!walletAddress || !signature || !timestamp) {
        throw missingAuthHeaders();
    }

    // 2. Validar formato de wallet
    if (!WALLET_REGEX.test(walletAddress)) {
        throw invalidWalletAddress();
    }

    // 3. Validar timestamp (ventana de 5 min)
    const requestTime = new Date(timestamp).getTime();
    if (isNaN(requestTime)) {
        throw authTimestampExpired();
    }

    const now = Date.now();
    if (Math.abs(now - requestTime) > AUTH_WINDOW_MS) {
        throw authTimestampExpired();
    }

    // 4. Reconstruir mensaje y verificar firma
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
        // Re-lanzar si ya es ApiError
        if (error instanceof Error && error.name === 'ApiError') {
            throw error;
        }
        // Error de viem (firma malformada, etc.)
        throw authSignatureInvalid();
    }

    // 5. Inyectar wallet autenticada en el request
    request.authenticatedWallet = walletAddress.toLowerCase();
}
