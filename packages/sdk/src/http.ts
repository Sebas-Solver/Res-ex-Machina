import { RxMNetworkError, parseApiError } from './errors.js';

/**
 * HTTP client wrapper with retry, timeout, and RxM error parsing.
 *
 * Designed for agents: on failure, throws typed errors that agents
 * can handle programmatically (especially rate limits).
 */
export class RxMHttpClient {
    private readonly baseUrl: string;
    private readonly timeoutMs: number;
    private readonly maxRetries: number;

    constructor(baseUrl: string, timeoutMs = 10_000, maxRetries = 3) {
        // Remove trailing slash
        this.baseUrl = baseUrl.replace(/\/+$/, '');
        this.timeoutMs = timeoutMs;
        this.maxRetries = maxRetries;
    }

    async get<T>(path: string, headers?: Record<string, string>): Promise<T> {
        return this.request<T>('GET', path, undefined, headers);
    }

    async post<T>(path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
        return this.request<T>('POST', path, body, headers);
    }

    async delete<T>(path: string, headers?: Record<string, string>): Promise<T> {
        return this.request<T>('DELETE', path, undefined, headers);
    }

    private async request<T>(
        method: string,
        path: string,
        body?: unknown,
        extraHeaders?: Record<string, string>,
    ): Promise<T> {
        const url = `${this.baseUrl}${path}`;
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...extraHeaders,
        };

        let lastError: Error | undefined;

        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

                const response = await fetch(url, {
                    method,
                    headers,
                    body: body ? JSON.stringify(body) : undefined,
                    signal: controller.signal,
                });

                clearTimeout(timeout);

                // Successful response
                if (response.ok) {
                    // 204 No Content
                    if (response.status === 204) {
                        return undefined as T;
                    }
                    return await response.json() as T;
                }

                // API error — parse and throw
                const errorBody = await response.json().catch(() => ({}));
                throw parseApiError(response.status, errorBody);

            } catch (error) {
                lastError = error as Error;

                // Do not retry validation errors (4xx except 429)
                if (error instanceof Error && 'statusCode' in error) {
                    const statusCode = (error as { statusCode: number }).statusCode;
                    if (statusCode >= 400 && statusCode < 500 && statusCode !== 429) {
                        throw error;
                    }
                }

                // If this is the last attempt, break
                if (attempt === this.maxRetries) {
                    break;
                }

                // Exponential backoff: 1s, 2s, 4s
                const backoffMs = Math.min(1000 * Math.pow(2, attempt), 8000);
                await new Promise(resolve => setTimeout(resolve, backoffMs));
            }
        }

        // If we get here, all retries failed
        if (lastError && 'code' in lastError) {
            throw lastError;
        }
        throw new RxMNetworkError(lastError?.message ?? 'Request failed after retries');
    }
}
