import type { Address, Hex, Account } from 'viem';

// ─── Constructor options ───────────────────────────────────────

export interface RxMClientOptions {
    /** viem Account (LocalAccount from privateKeyToAccount, mnemonicToAccount, etc.) */
    account: Account;
    /** L2 RPC URL for paying fees (e.g., https://sepolia.base.org) */
    rpcUrl: string;
    /** RxM API base URL (e.g., https://res-ex-machina-api.onrender.com) */
    apiUrl: string;
    /** Address that receives fees */
    feeReceiverAddress: Address;
    /** Fee in native ETH/MATIC (default: 0.01) */
    feeAmount?: number;
    /** L2 Chain ID (default: 84532 = Base Sepolia) */
    chainId?: number;
    /** HTTP request timeout in ms (default: 10000) */
    httpTimeoutMs?: number;
    /** Number of HTTP retries (default: 3) */
    httpRetries?: number;
}

// ─── Record options ────────────────────────────────────────────

export type ProcessType = 'direct' | 'pipeline' | 'iterative' | 'autonomous';

export type Visibility = 'proof_only' | 'input_hash_only' | 'content_optional';

export interface RecordOptions {
    /** Model identifier: provider:model:version (e.g., openai:gpt-4o:2026-01) */
    modelId: string;
    /** Content MIME type (default: text/plain) */
    contentType?: string;
    /** Descriptive tags (max 10, max 64 chars each) */
    tags?: string[];
    /** Record visibility (default: proof_only) */
    visibility?: Visibility;
    /** External reference URL (optional) */
    externalRef?: string;
    /** Runtime ID (default: auto-detect) */
    runtimeId?: string;
    /** Process type (default: direct) */
    processType?: ProcessType;
    /** Human intervention level 0-5 (default: 0) */
    humanInterventionLevel?: number;
    /** Pipeline steps (default: 1) */
    pipelineSteps?: number;

    // ─── BYO (Bring Your Own) mode ──────────────────────────────

    /** If provided, the SDK will NOT pay the fee (BYO mode) */
    feeTxHash?: Hex;
    /** If provided, the SDK will NOT compute the hash (BYO mode) */
    contentHash?: string;
    /** If true, wait for the record to be anchored on-chain */
    waitForAnchor?: boolean;
}

// ─── Batch ─────────────────────────────────────────────────────

export interface BatchItem {
    /** Content to register */
    content: string | Buffer | Uint8Array;
    /** Record options (feeTxHash required in v0.1) */
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

// ─── Responses ─────────────────────────────────────────────────

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
    /** HMAC secret — only returned once at registration */
    secret: string;
}

export interface WebhookListResult {
    webhooks: Webhook[];
    total: number;
}
