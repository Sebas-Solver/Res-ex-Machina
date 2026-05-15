/**
 * Typed errors for the @res-ex-machina/sdk.
 *
 * Each error has a `code` that maps directly to the API error catalog
 * (error-catalog.md), enabling agents to perform programmatic retry
 * based on error codes.
 */

export class RxMError extends Error {
    public readonly code: string;
    public readonly statusCode?: number;
    public readonly details?: Record<string, unknown>;

    constructor(code: string, message: string, statusCode?: number, details?: Record<string, unknown>) {
        super(message);
        this.name = 'RxMError';
        this.code = code;
        this.statusCode = statusCode;
        this.details = details;
    }
}

/**
 * Rate limit exceeded. Includes `retryAfterMs` so agents
 * can retry programmatically.
 */
export class RxMRateLimitError extends RxMError {
    public readonly retryAfterMs: number;

    constructor(retryAfterMs: number, details?: Record<string, unknown>) {
        super('rate_limit_exceeded', `Rate limit exceeded. Retry after ${retryAfterMs}ms`, 429, details);
        this.name = 'RxMRateLimitError';
        this.retryAfterMs = retryAfterMs;
    }
}

/**
 * Network or timeout error.
 */
export class RxMNetworkError extends RxMError {
    constructor(message: string) {
        super('network_error', message);
        this.name = 'RxMNetworkError';
    }
}

/**
 * Local validation error (before calling the API).
 */
export class RxMValidationError extends RxMError {
    constructor(message: string, details?: Record<string, unknown>) {
        super('validation_error', message, 400, details);
        this.name = 'RxMValidationError';
    }
}

/**
 * Thrown when a read-only client attempts an operation that requires a wallet.
 * Operations that require a wallet: record, recordBatch, webhooks, signing, paying.
 */
export class RxMReadOnlyError extends RxMError {
    constructor(operation: string) {
        super(
            'read_only_client',
            `This RxMClient was initialized in read-only mode and cannot perform operations that require a wallet. Attempted: ${operation}`,
        );
        this.name = 'RxMReadOnlyError';
    }
}

/**
 * Parses an API error response and throws the appropriate typed exception.
 */
export function parseApiError(statusCode: number, body: unknown): RxMError {
    const errorBody = body as { error?: { code?: string; message?: string; details?: Record<string, unknown> } };
    const code = errorBody?.error?.code ?? 'unknown_error';
    const message = errorBody?.error?.message ?? 'Unknown API error';
    const details = errorBody?.error?.details;

    if (statusCode === 429) {
        const retryAfterMs = (details as { reset?: number })?.reset ?? 60_000;
        return new RxMRateLimitError(retryAfterMs, details);
    }

    return new RxMError(code, message, statusCode, details);
}
