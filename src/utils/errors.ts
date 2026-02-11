import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Error estructurado de la API.
 * Sigue el formato definido en error-catalog.md:
 * { error: { code, message, details? } }
 */
export class ApiError extends Error {
    constructor(
        public readonly statusCode: number,
        public readonly code: string,
        message: string,
        public readonly details?: Record<string, unknown>,
    ) {
        super(message);
        this.name = 'ApiError';
    }

    toJSON() {
        return {
            error: {
                code: this.code,
                message: this.message,
                ...(this.details && { details: this.details }),
            },
        };
    }
}

// --- Factory functions para errores del POST /v1/records ---

export const invalidPayload = (details?: Record<string, unknown>) =>
    new ApiError(400, 'invalid_payload', 'Request body is malformed or incomplete', details);

export const invalidContentHash = () =>
    new ApiError(400, 'invalid_content_hash', 'content_hash must match format sha256:{64 hex chars}', {
        expected: 'sha256:{64hex}',
    });

export const invalidPogSchema = (details?: Record<string, unknown>) =>
    new ApiError(400, 'invalid_pog_schema', 'pog_bundle does not match PoG v1 schema', details);

export const invalidPogVersion = () =>
    new ApiError(400, 'invalid_pog_version', 'pog_bundle schema must be "pog.v1"');

export const invalidTags = () =>
    new ApiError(400, 'invalid_tags', 'Tags must be an array of max 10 non-empty strings');

export const invalidVisibility = () =>
    new ApiError(400, 'invalid_visibility', 'visibility must be one of: proof_only, input_hash_only, content_optional');

export const payloadTooLarge = () =>
    new ApiError(400, 'payload_too_large', 'Request body exceeds size limit (64KB)');

export const invalidSignature = () =>
    new ApiError(401, 'invalid_signature', 'EIP-712 signature is invalid or cannot be verified');

export const signerMismatch = (recovered: string, expected: string) =>
    new ApiError(401, 'signer_mismatch', 'Recovered signer does not match agent_wallet', {
        recovered_signer: recovered,
        expected_wallet: expected,
    });

export const feeNotVerified = (reason?: string) =>
    new ApiError(402, 'fee_not_verified', 'Fee transaction could not be verified on-chain', {
        ...(reason && { reason }),
    });

export const feeInsufficient = () =>
    new ApiError(402, 'fee_insufficient', 'Fee amount is insufficient');

export const feeWrongRecipient = () =>
    new ApiError(402, 'fee_wrong_recipient', 'Fee transaction recipient is incorrect');

export const feeTxExpired = () =>
    new ApiError(402, 'fee_tx_expired', 'Fee transaction is too old (>24h)');

export const feeTxReused = () =>
    new ApiError(402, 'fee_tx_reused', 'Fee transaction has already been used for another record');

export const duplicateContentHash = () =>
    new ApiError(409, 'duplicate_content_hash', 'A record with this content_hash already exists');

export const duplicateNonce = () =>
    new ApiError(409, 'duplicate_nonce', 'This nonce has already been used by this wallet');

// --- Factory functions para errores de GET /v1/records ---

export const invalidRecordId = () =>
    new ApiError(400, 'invalid_record_id', 'Record ID is not a valid UUID');

export const recordNotFound = () =>
    new ApiError(404, 'record_not_found', 'No record found with the given identifier');

/**
 * Error handler global para Fastify.
 * Intercepta ApiError y devuelve el formato estándar.
 */
export function apiErrorHandler(
    error: Error,
    _request: FastifyRequest,
    reply: FastifyReply,
) {
    if (error instanceof ApiError) {
        return reply.status(error.statusCode).send(error.toJSON());
    }

    // Errores de Fastify (validación, content-type, etc.)
    const fastifyError = error as Error & { statusCode?: number };
    if (typeof fastifyError.statusCode === 'number') {
        const statusCode = fastifyError.statusCode;
        return reply.status(statusCode).send({
            error: {
                code: statusCode === 415 ? 'unsupported_media_type' : 'invalid_payload',
                message: error.message,
            },
        });
    }

    // Error no esperado — nunca exponer detalles técnicos
    console.error('Unhandled error:', error);
    return reply.status(500).send({
        error: {
            code: 'internal_error',
            message: 'An internal server error occurred',
        },
    });
}
