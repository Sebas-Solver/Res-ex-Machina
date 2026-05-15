/**
 * Webhooks subclient — management operations (not record registration).
 *
 * Webhooks use EIP-191 authentication (plain message signature),
 * different from records which use EIP-712.
 *
 * When the parent RxMClient is in read-only mode, all methods throw
 * RxMReadOnlyError because webhook operations require wallet authentication.
 */
import type { Account, Hex } from 'viem';
import { RxMHttpClient } from './http.js';
import { RxMReadOnlyError } from './errors.js';
import type { WebhookRegistration, WebhookListResult } from './types.js';

export class WebhooksClient {
    protected http: RxMHttpClient;
    protected account: Account | null;

    constructor(http: RxMHttpClient, account: Account | null) {
        this.http = http;
        this.account = account;
    }

    /**
     * Guard: throws RxMReadOnlyError if no account is available.
     */
    private assertHasAccount(operation: string): asserts this is { account: Account } {
        if (!this.account) {
            throw new RxMReadOnlyError(`webhooks.${operation}`);
        }
    }

    /**
     * Generates EIP-191 authentication headers for webhooks.
     * Signature message: "RxM-Webhook:{wallet}:{timestamp}"
     */
    private async getAuthHeaders(): Promise<Record<string, string>> {
        this.assertHasAccount('getAuthHeaders');

        const timestamp = new Date().toISOString();
        const wallet = this.account!.address;
        const message = `RxM-Webhook:${wallet}:${timestamp}`;

        if (!this.account!.signMessage) {
            throw new Error('Account must support signMessage (use privateKeyToAccount or similar)');
        }

        const signature = await this.account!.signMessage({ message });

        return {
            'X-Wallet-Address': wallet,
            'X-Timestamp': timestamp,
            'X-Signature': signature,
        };
    }

    /**
     * Register a webhook. The HMAC secret is returned only once.
     *
     * @param url - HTTPS URL to receive notifications
     * @returns { webhookId, secret }
     */
    async register(url: string): Promise<WebhookRegistration> {
        this.assertHasAccount('register');
        const headers = await this.getAuthHeaders();
        return this.http.post<WebhookRegistration>('/v1/webhooks', { url }, headers);
    }

    /**
     * List active webhooks for the current wallet.
     * Requires wallet authentication (EIP-191).
     */
    async list(): Promise<WebhookListResult> {
        this.assertHasAccount('list');
        const headers = await this.getAuthHeaders();
        return this.http.get<WebhookListResult>('/v1/webhooks', headers);
    }

    /**
     * Deactivate (soft-delete) a webhook.
     *
     * @param webhookId - ID of the webhook to remove
     */
    async delete(webhookId: string): Promise<void> {
        this.assertHasAccount('delete');
        const headers = await this.getAuthHeaders();
        await this.http.delete(`/v1/webhooks/${webhookId}`, headers);
    }
}
