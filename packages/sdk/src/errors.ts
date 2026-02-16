/**
 * Errores tipados del SDK @rxm/sdk.
 *
 * Cada error tiene un `code` que mapea directamente al catálogo de errores
 * de la API (error-catalog.md), permitiendo a los agentes hacer retry
 * programático basado en el código.
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
 * Rate limit alcanzado. Incluye `retryAfterMs` para que los agentes
 * puedan reintentar programáticamente.
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
 * Error de red o timeout.
 */
export class RxMNetworkError extends RxMError {
    constructor(message: string) {
        super('network_error', message);
        this.name = 'RxMNetworkError';
    }
}

/**
 * Error de validación local (antes de llamar a la API).
 */
export class RxMValidationError extends RxMError {
    constructor(message: string, details?: Record<string, unknown>) {
        super('validation_error', message, 400, details);
        this.name = 'RxMValidationError';
    }
}

/**
 * Parsea una respuesta de error de la API RxM y lanza la excepción tipada.
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
