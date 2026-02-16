import type { Address, Hex, Account } from 'viem';

// ─── Constructor options ───────────────────────────────────────

export interface RxMClientOptions {
    /** viem Account (LocalAccount from privateKeyToAccount, mnemonicToAccount, etc.) */
    account: Account;
    /** RPC URL de la L2 para pagar fees (ej: https://sepolia.base.org) */
    rpcUrl: string;
    /** URL base de la API RxM (ej: https://res-ex-machina-api.onrender.com) */
    apiUrl: string;
    /** Dirección que recibe los fees */
    feeReceiverAddress: Address;
    /** Fee en ETH/MATIC nativo (default: 0.01) */
    feeAmount?: number;
    /** Chain ID de la L2 (default: 84532 = Base Sepolia) */
    chainId?: number;
    /** Timeout para peticiones HTTP en ms (default: 10000) */
    httpTimeoutMs?: number;
    /** Número de reintentos HTTP (default: 3) */
    httpRetries?: number;
}

// ─── Record options ────────────────────────────────────────────

export type ProcessType = 'direct' | 'pipeline' | 'iterative' | 'autonomous';

export type Visibility = 'proof_only' | 'input_hash_only' | 'content_optional';

export interface RecordOptions {
    /** Identificador del modelo: provider:model:version (ej: openai:gpt-4o:2026-01) */
    modelId: string;
    /** Tipo MIME del contenido (default: text/plain) */
    contentType?: string;
    /** Tags descriptivos (máx 10, máx 64 chars cada uno) */
    tags?: string[];
    /** Visibilidad del registro (default: proof_only) */
    visibility?: Visibility;
    /** Referencia externa URL (opcional) */
    externalRef?: string;
    /** ID del runtime (default: auto-detect) */
    runtimeId?: string;
    /** Tipo de proceso (default: direct) */
    processType?: ProcessType;
    /** Nivel de intervención humana 0-5 (default: 0) */
    humanInterventionLevel?: number;
    /** Pasos del pipeline (default: 1) */
    pipelineSteps?: number;

    // ─── Modo BYO (Bring Your Own) ─────────────────────────────

    /** Si se proporciona, el SDK NO paga fee (modo BYO) */
    feeTxHash?: Hex;
    /** Si se proporciona, el SDK NO calcula hash (modo BYO) */
    contentHash?: string;
    /** Si true, espera a que el record se ancle en blockchain */
    waitForAnchor?: boolean;
}

// ─── Batch ─────────────────────────────────────────────────────

export interface BatchItem {
    /** Contenido a registrar */
    content: string | Buffer | Uint8Array;
    /** Opciones del record (feeTxHash obligatorio en v0.1) */
    options: RecordOptions & { feeTxHash: Hex };
}

export interface BatchResultItem {
    index: number;
    status: 'created' | 'error';
    recordId?: string;
    state?: string;
    receiptHash?: string;
    error?: { code: string; message: string };
}

export interface BatchResult {
    results: BatchResultItem[];
    summary: { created: number; errors: number };
}

// ─── Respuestas ────────────────────────────────────────────────

export interface Receipt {
    recordId: string;
    state: string;
    receiptHash: string;
    createdAt: string;
}

export interface VerifyResult {
    exists: boolean;
    recordId?: string;
    state?: string;
    createdAt?: string;
    receiptHash?: string;
}

export interface RecordDetail {
    recordId: string;
    contentHash: string;
    state: string;
    receiptHash: string;
    createdAt: string;
    anchoredAt?: string;
    anchorTxHash?: string;
    pogBundle: Record<string, unknown>;
}

export interface ExportData {
    schema: string;
    recordId: string;
    contentHash: string;
    pogBundle: Record<string, unknown>;
    receiptHash: string;
    anchor?: Record<string, unknown>;
    temporalAttestation?: Record<string, unknown>;
}

export interface ListRecordsOptions {
    state?: string;
    limit?: number;
    offset?: number;
    sort?: 'created_at' | '-created_at';
}

export interface ListRecordsResult {
    records: RecordDetail[];
    total: number;
}

// ─── Webhooks ──────────────────────────────────────────────────

export interface Webhook {
    webhookId: string;
    url: string;
    active: boolean;
    createdAt: string;
}

export interface WebhookRegistration {
    webhookId: string;
    /** Secret HMAC — only returned once at registration */
    secret: string;
}

export interface WebhookListResult {
    webhooks: Webhook[];
    total: number;
}
