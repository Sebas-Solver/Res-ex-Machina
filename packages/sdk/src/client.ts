/**
 * RxMClient — Main SDK orchestrator.
 *
 * Principles:
 * - Smart defaults: an agent registers outputs without knowing EIP-712 or fees
 * - BYO options: advanced integrators control everything (feeTxHash, contentHash)
 * - Fail-safe: on failure, typed errors enable programmatic retry
 *
 * Minimal usage:
 *   const rxm = new RxMClient({ account, rpcUrl, apiUrl, feeReceiverAddress });
 *   const receipt = await rxm.record(content, { modelId: 'openai:gpt-4o:2026-01' });
 */
import type { Address, Hex, Account } from 'viem';
import { RxMHttpClient } from './http.js';
import { computeContentHash } from './hash.js';
import { signPoGBundle, type PoGSignatureMessage } from './sign.js';
import { payFee, type FeeConfig } from './fee.js';
import { WebhooksClient } from './webhooks.js';
import { RxMValidationError } from './errors.js';
import type {
    RxMClientOptions,
    RecordOptions,
    Receipt,
    BatchItem,
    BatchResult,
    VerifyResult,
    RecordDetail,
    ExportData,
    ListRecordsOptions,
    ListRecordsResult,
} from './types.js';

/**
 * Detects the current runtime for the runtime_id field.
 */
function detectRuntime(): string {
    if (typeof process !== 'undefined' && process.versions?.node) {
        return `node-${process.versions.node.split('.')[0]}.x`;
    }
    if (typeof Deno !== 'undefined') {
        return 'deno';
    }
    return 'unknown';
}

// Declaration to avoid TypeScript error with Deno
declare const Deno: { version?: { deno: string } } | undefined;

export class RxMClient {
    private readonly account: Account;
    private readonly rpcUrl: string;
    private readonly apiUrl: string;
    private readonly feeReceiverAddress: Address;
    private readonly feeAmount: number;
    private readonly chainId: number;
    private readonly http: RxMHttpClient;

    /** Webhooks subclient (register, list, delete) */
    public readonly webhooks: WebhooksClient;

    constructor(options: RxMClientOptions) {
        this.account = options.account;
        this.rpcUrl = options.rpcUrl;
        this.apiUrl = options.apiUrl;
        this.feeReceiverAddress = options.feeReceiverAddress;
        this.feeAmount = options.feeAmount ?? 0.01;
        this.chainId = options.chainId ?? 84532; // Base Sepolia default

        this.http = new RxMHttpClient(
            options.apiUrl,
            options.httpTimeoutMs ?? 10_000,
            options.httpRetries ?? 3,
        );

        this.webhooks = new WebhooksClient(this.http, this.account);
    }

    // ─── RECORD ───────────────────────────────────────────────

    /**
     * Register an output in RxM.
     *
     * Full flow (simple mode):
     *   1. Compute SHA-256 of content
     *   2. Generate unique nonce
     *   3. Build PoG bundle
     *   4. Sign with EIP-712
     *   5. Pay fee on-chain
     *   6. POST /v1/records
     *
     * BYO mode:
     *   - If feeTxHash provided, skip step 5
     *   - If contentHash provided, skip step 1
     *
     * @param content - Content to register (string, Buffer, Uint8Array)
     * @param options - Record options
     * @returns Receipt with recordId, state, receiptHash
     */
    async record(content: string | Buffer | Uint8Array, options: RecordOptions): Promise<Receipt> {
        // Local validation (fail before calling the API)
        this.validateRecordOptions(options);

        // 1. Hash
        const contentHash = options.contentHash
            ?? await computeContentHash(content);

        // 2. Nonce
        const nonce = crypto.randomUUID();

        // 3. Timestamp
        const timestamp = new Date().toISOString();

        // 4. PoG message (flattened for EIP-712)
        const pogMessage: PoGSignatureMessage = {
            schema: 'pog.v1',
            content_hash: contentHash,
            agent_wallet: this.account.address,
            model_id: options.modelId,
            runtime_id: options.runtimeId ?? detectRuntime(),
            process_type: options.processType ?? 'direct',
            human_intervention_level: options.humanInterventionLevel ?? 0,
            pipeline_steps: options.pipelineSteps ?? 1,
            timestamp,
            nonce,
        };

        // 5. EIP-712 signature
        const signature = await signPoGBundle(this.account, pogMessage);

        // 6. Fee (skip if BYO)
        let feeTxHash = options.feeTxHash;
        if (!feeTxHash) {
            const feeConfig: FeeConfig = {
                account: this.account,
                rpcUrl: this.rpcUrl,
                chainId: this.chainId,
                feeReceiverAddress: this.feeReceiverAddress,
                feeAmount: this.feeAmount,
            };
            feeTxHash = await payFee(feeConfig);
        }

        // 7. POST /v1/records
        const body = {
            pog_bundle: {
                schema: 'pog.v1',
                content_hash: contentHash,
                agent_wallet: this.account.address,
                model_id: options.modelId,
                runtime_id: pogMessage.runtime_id,
                generation_process: {
                    process_type: pogMessage.process_type,
                    human_intervention_level: pogMessage.human_intervention_level,
                    pipeline_steps: pogMessage.pipeline_steps,
                },
                timestamp,
                nonce,
                signature,
            },
            content_type: options.contentType ?? 'text/plain',
            visibility: options.visibility ?? 'proof_only',
            tags: options.tags ?? [],
            ...(options.externalRef && { external_ref: options.externalRef }),
            fee_amount: this.feeAmount,
            fee_currency: 'ETH',
            fee_tx_hash: feeTxHash,
        };

        const response = await this.http.post<{
            record_id: string;
            state: string;
            receipt_hash: string;
            created_at: string;
        }>('/v1/records', body);

        const receipt: Receipt = {
            recordId: response.record_id,
            state: response.state,
            receiptHash: response.receipt_hash,
            createdAt: response.created_at,
        };

        // 8. Wait for anchor (optional)
        if (options.waitForAnchor) {
            return this.waitForRecord(receipt.recordId);
        }

        return receipt;
    }

    /**
     * Register a batch of outputs (up to 100).
     * v0.1: each item MUST have feeTxHash (BYO mode).
     */
    async recordBatch(items: BatchItem[]): Promise<BatchResult> {
        if (items.length === 0) {
            throw new RxMValidationError('Batch cannot be empty');
        }
        if (items.length > 100) {
            throw new RxMValidationError('Batch cannot exceed 100 items');
        }

        // Build each batch record
        const records = await Promise.all(
            items.map(async (item) => {
                const contentHash = item.options.contentHash
                    ?? await computeContentHash(item.content);
                const nonce = crypto.randomUUID();
                const timestamp = new Date().toISOString();

                const pogMessage: PoGSignatureMessage = {
                    schema: 'pog.v1',
                    content_hash: contentHash,
                    agent_wallet: this.account.address,
                    model_id: item.options.modelId,
                    runtime_id: item.options.runtimeId ?? detectRuntime(),
                    process_type: item.options.processType ?? 'direct',
                    human_intervention_level: item.options.humanInterventionLevel ?? 0,
                    pipeline_steps: item.options.pipelineSteps ?? 1,
                    timestamp,
                    nonce,
                };

                const signature = await signPoGBundle(this.account, pogMessage);

                return {
                    pog_bundle: {
                        schema: 'pog.v1',
                        content_hash: contentHash,
                        agent_wallet: this.account.address,
                        model_id: item.options.modelId,
                        runtime_id: pogMessage.runtime_id,
                        generation_process: {
                            process_type: pogMessage.process_type,
                            human_intervention_level: pogMessage.human_intervention_level,
                            pipeline_steps: pogMessage.pipeline_steps,
                        },
                        timestamp,
                        nonce,
                        signature,
                    },
                    content_type: item.options.contentType ?? 'text/plain',
                    visibility: item.options.visibility ?? 'proof_only',
                    tags: item.options.tags ?? [],
                    fee_amount: this.feeAmount,
                    fee_currency: 'ETH',
                    fee_tx_hash: item.options.feeTxHash,
                };
            }),
        );

        return this.http.post<BatchResult>('/v1/records/batch', { records });
    }

    // ─── QUERY ────────────────────────────────────────────────

    /**
     * Verify whether content (or hash) is already registered.
     */
    async verify(contentOrHash: string): Promise<VerifyResult> {
        const hash = contentOrHash.startsWith('sha256:')
            ? contentOrHash
            : await computeContentHash(contentOrHash);

        return this.http.get<VerifyResult>(`/v1/records/verify?content_hash=${encodeURIComponent(hash)}`);
    }

    /**
     * Get record details by ID.
     */
    async getRecord(recordId: string): Promise<RecordDetail> {
        return this.http.get<RecordDetail>(`/v1/records/${recordId}`);
    }

    /**
     * Export an offline-verifiable receipt.
     */
    async export(recordId: string): Promise<ExportData> {
        return this.http.get<ExportData>(`/v1/records/${recordId}/export`);
    }

    /**
     * List records from the current wallet with filters.
     */
    async listRecords(options?: ListRecordsOptions): Promise<ListRecordsResult> {
        const params = new URLSearchParams();
        params.set('agent_wallet', this.account.address);
        if (options?.state) params.set('state', options.state);
        if (options?.limit) params.set('limit', options.limit.toString());
        if (options?.offset) params.set('offset', options.offset.toString());
        if (options?.sort) params.set('sort', options.sort);

        return this.http.get<ListRecordsResult>(`/v1/records?${params.toString()}`);
    }

    // ─── POLLING ──────────────────────────────────────────────

    /**
     * Wait for a record to be anchored on-chain (polling).
     *
     * @param recordId - Record ID
     * @param timeoutMs - Maximum timeout (default: 30s)
     * @param intervalMs - Polling interval (default: 2s)
     */
    async waitForRecord(recordId: string, timeoutMs = 30_000, intervalMs = 2_000): Promise<Receipt> {
        const start = Date.now();

        while (Date.now() - start < timeoutMs) {
            const record = await this.getRecord(recordId);

            if (record.state === 'anchored' || record.state === 'anchor_failed') {
                return {
                    recordId: record.recordId,
                    state: record.state,
                    receiptHash: record.receiptHash,
                    createdAt: record.createdAt,
                };
            }

            await new Promise(resolve => setTimeout(resolve, intervalMs));
        }

        // Timeout — return current state
        const record = await this.getRecord(recordId);
        return {
            recordId: record.recordId,
            state: record.state,
            receiptHash: record.receiptHash,
            createdAt: record.createdAt,
        };
    }

    // ─── LOCAL VALIDATION ─────────────────────────────────────

    private validateRecordOptions(options: RecordOptions): void {
        if (!options.modelId || options.modelId.length === 0) {
            throw new RxMValidationError('modelId is required');
        }
        if (options.modelId.length > 128) {
            throw new RxMValidationError('modelId must be at most 128 characters');
        }
        if (options.tags && options.tags.length > 10) {
            throw new RxMValidationError('Maximum 10 tags allowed');
        }
        if (options.tags) {
            for (const tag of options.tags) {
                if (tag.length > 64) {
                    throw new RxMValidationError(`Tag "${tag}" exceeds 64 character limit`);
                }
            }
        }
        if (options.humanInterventionLevel !== undefined) {
            if (options.humanInterventionLevel < 0 || options.humanInterventionLevel > 5) {
                throw new RxMValidationError('humanInterventionLevel must be 0-5');
            }
        }
        if (options.pipelineSteps !== undefined && options.pipelineSteps < 1) {
            throw new RxMValidationError('pipelineSteps must be >= 1');
        }
    }
}
