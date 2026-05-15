import type { Address, Hex, Account } from 'viem';

// ─── Constructor options (discriminated union) ─────────────────

/** Writable client — requires wallet, RPC, and fee configuration. */
export interface RxMWritableClientOptions {
    /** Explicitly not read-only (can be omitted). */
    readOnly?: false;
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

/** Read-only client — only requires API URL. No wallet, no signing, no fees. */
export interface RxMReadOnlyClientOptions {
    /** Must be true to create a read-only client. */
    readOnly: true;
    /** RxM API base URL (e.g., https://res-ex-machina-api.onrender.com) */
    apiUrl: string;
    /** HTTP request timeout in ms (default: 10000) */
    httpTimeoutMs?: number;
    /** Number of HTTP retries (default: 3) */
    httpRetries?: number;
}

/** SDK constructor options — writable or read-only. */
export type RxMClientOptions = RxMWritableClientOptions | RxMReadOnlyClientOptions;

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
    /** Payment mode: 'legacy' (ETH fee_tx_hash) or 'x402' (USDC signature) */
    paymentMode?: 'legacy' | 'x402';
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
    /** Wallet address to filter by. Required in read-only mode; defaults to account.address in writable mode. */
    agentWallet?: string;
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
