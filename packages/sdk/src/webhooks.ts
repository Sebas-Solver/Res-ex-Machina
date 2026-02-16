/**
 * Subcliente de webhooks — operaciones de gestión (no registro).
 *
 * Los webhooks usan autenticación EIP-191 (firma de mensaje plano),
 * diferente de los records que usan EIP-712.
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
     * Genera los headers de autenticación EIP-191 para webhooks.
     * Firma: "RxM-Webhook:{wallet}:{timestamp}"
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
     * Registra un webhook. El secret HMAC se devuelve solo una vez.
     *
     * @param url - URL HTTPS donde enviar notificaciones
     * @returns { webhookId, secret }
     */
    async register(url: string): Promise<WebhookRegistration> {
        const headers = await this.getAuthHeaders();
        return this.http.post<WebhookRegistration>('/v1/webhooks', { url }, headers);
    }

    /**
     * Lista los webhooks activos del wallet actual.
     */
    async list(): Promise<WebhookListResult> {
        const headers = await this.getAuthHeaders();
        return this.http.get<WebhookListResult>('/v1/webhooks', headers);
    }

    /**
     * Desactiva (soft-delete) un webhook.
     *
     * @param webhookId - ID del webhook a eliminar
     */
    async delete(webhookId: string): Promise<void> {
        const headers = await this.getAuthHeaders();
        await this.http.delete(`/v1/webhooks/${webhookId}`, headers);
    }
}
