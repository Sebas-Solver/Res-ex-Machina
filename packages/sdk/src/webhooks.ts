/**
 * Webhooks subclient — management operations (not record registration).
 *
 * Webhooks use EIP-191 authentication (plain message signature),
 * different from records which use EIP-712.
 */
import type { Account, Hex } from 'viem';
import { RxMHttpClient } from './http.js';
import type { WebhookRegistration, WebhookListResult } from './types.js';

export class WebhooksClient {
    private readonly http: RxMHttpClient;
    private readonly account: Account;

    constructor(http: RxMHttpClient, account: Account) {
        this.http = http;
        this.account = account;
    }

    /**
     * Generates EIP-191 authentication headers for webhooks.
     * Signature message: "RxM-Webhook:{wallet}:{timestamp}"
     */
    private async getAuthHeaders(): Promise<Record<string, string>> {
        const timestamp = new Date().toISOString();
        const wallet = this.account.address;
        const message = `RxM-Webhook:${wallet}:${timestamp}`;

        if (!this.account.signMessage) {
            throw new Error('Account must support signMessage (use privateKeyToAccount or similar)');
        }

        const signature = await this.account.signMessage({ message });

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
        const headers = await this.getAuthHeaders();
        return this.http.post<WebhookRegistration>('/v1/webhooks', { url }, headers);
    }

    /**
     * List active webhooks for the current wallet.
     */
    async list(): Promise<WebhookListResult> {
        const headers = await this.getAuthHeaders();
        return this.http.get<WebhookListResult>('/v1/webhooks', headers);
    }

    /**
     * Deactivate (soft-delete) a webhook.
     *
     * @param webhookId - ID of the webhook to remove
     */
    async delete(webhookId: string): Promise<void> {
        const headers = await this.getAuthHeaders();
        await this.http.delete(`/v1/webhooks/${webhookId}`, headers);
    }
}
