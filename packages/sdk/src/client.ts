/**
 * RxMClient — Main SDK orchestrator.
 *
 * Supports two modes:
 * - **Writable**: requires account, rpcUrl, feeReceiverAddress. Can register, sign, pay.
 * - **Read-only**: requires only apiUrl. Can verify, query, export. Cannot write.
 *
 * Minimal usage (writable):
 *   const rxm = new RxMClient({ account, rpcUrl, apiUrl, feeReceiverAddress });
 *   const receipt = await rxm.record(content, { modelId: 'openai:gpt-4o:2026-01' });
 *
 * Minimal usage (read-only):
 *   const rxm = new RxMClient({ apiUrl: 'https://...', readOnly: true });
 *   const result = await rxm.verify('sha256:abc...');
 */
import type { Address, Hex, Account } from 'viem';
import { RxMHttpClient } from './http.js';
import { computeContentHash } from './hash.js';
import { signPoGBundle, type PoGSignatureMessage } from './sign.js';
import { payFee, type FeeConfig } from './fee.js';
import { WebhooksClient } from './webhooks.js';
import { RxMValidationError, RxMReadOnlyError } from './errors.js';
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
    private _readOnly: boolean;
    protected account: Account | null;
    protected rpcUrl: string | null;
    protected apiUrl: string;
    protected feeReceiverAddress: Address | null;
    protected feeAmount: number;
    protected chainId: number;
    protected http: RxMHttpClient;

    /** Webhooks subclient (register, list, delete) */
    public readonly webhooks: WebhooksClient;

    constructor(options: RxMClientOptions) {
        if (options.readOnly) {
            // Read-only mode — no wallet, no signing, no fees
            this._readOnly = true;
            this.account = null;
            this.rpcUrl = null;
            this.feeReceiverAddress = null;
            this.feeAmount = 0;
            this.chainId = 0;
            this.apiUrl = options.apiUrl;

            this.http = new RxMHttpClient(
                options.apiUrl,
                options.httpTimeoutMs ?? 10_000,
                options.httpRetries ?? 3,
            );

            // Webhooks: pass null account → all methods throw RxMReadOnlyError
            this.webhooks = new WebhooksClient(this.http, null);
        } else {
            // Writable mode — full capabilities
            this._readOnly = false;
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

            this.webhooks = new WebhooksClient(this.http, options.account);
        }
    }

    /** Returns true if this client is in read-only mode. */
    get readOnly(): boolean {
        return this._readOnly;
    }

    /**
     * Guard: throws RxMReadOnlyError if client is read-only.
     */
    private assertWritable(operation: string): asserts this is { account: Account; rpcUrl: string; feeReceiverAddress: Address } {
        if (this._readOnly) {
            throw new RxMReadOnlyError(operation);
        }
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
        this.assertWritable('record');

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
            agent_wallet: this.account!.address,
            model_id: options.modelId,
            runtime_id: options.runtimeId ?? detectRuntime(),
            process_type: options.processType ?? 'direct',
            human_intervention_level: options.humanInterventionLevel ?? 0,
            pipeline_steps: options.pipelineSteps ?? 1,
            timestamp,
            nonce,
        };

        // 5. EIP-712 signature
        const signature = await signPoGBundle(this.account!, pogMessage);

        // 6. Fee (skip if BYO or x402)
        let feeTxHash = options.feeTxHash;
        if (!feeTxHash && options.paymentMode !== 'x402') {
            const feeConfig: FeeConfig = {
                account: this.account!,
                rpcUrl: this.rpcUrl!,
                chainId: this.chainId,
                feeReceiverAddress: this.feeReceiverAddress!,
                feeAmount: this.feeAmount,
            };
            feeTxHash = await payFee(feeConfig);
        }

        // 7. POST /v1/records
        const body = {
            pog_bundle: {
                schema: 'pog.v1',
                content_hash: contentHash,
                agent_wallet: this.account!.address,
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

        if (options.paymentMode === 'x402') {
            return this.recordX402(body, options);
        }

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

    private async recordX402(body: any, options: RecordOptions): Promise<Receipt> {
        const paymentIdentifier = crypto.randomUUID();
        
        let response: any;
        let paymentRequiredTerms: string | undefined;

        try {
            // Primer intento sin firma x402
            response = await this.http.post('/v1/records', body, {
                'PAYMENT-IDENTIFIER': paymentIdentifier
            });
        } catch (error: any) {
            if (error.code === 'payment_required' && error.details?.requirements) {
                paymentRequiredTerms = Buffer.from(JSON.stringify(error.details.requirements)).toString('base64');
            } else {
                throw error;
            }
        }

        if (paymentRequiredTerms) {
            // Interactuar con la wallet para firmar el pago (simulado por ahora para el SDK si no tenemos evm client)
            // En un entorno de producción, esto usará el cliente EVM de x402 para firmar o transferir USDC.
            const signature = await this.signX402Payment(paymentRequiredTerms);
            
            // Reintento Idempotente
            response = await this.http.post('/v1/records', body, {
                'PAYMENT-IDENTIFIER': paymentIdentifier,
                'PAYMENT-SIGNATURE': signature
            });
        }

        const receipt: Receipt = {
            recordId: response.record_id,
            state: response.state,
            receiptHash: response.receipt_hash,
            createdAt: response.created_at,
        };

        if (options.waitForAnchor) {
            return this.waitForRecord(receipt.recordId);
        }

        return receipt;
    }

    private async signX402Payment(termsBase64: string): Promise<string> {
        // Parse the requirements from the 402 response
        const reqs = JSON.parse(Buffer.from(termsBase64, 'base64').toString('utf8'));
        console.log("Parsed reqs:", JSON.stringify(reqs, null, 2));
        
        // Dynamically import x402 modules to keep the SDK lightweight if x402 is not used
        const { ExactEvmScheme, toClientEvmSigner } = await import('@x402/evm');
        const { createPublicClient, http } = await import('viem');

        // Create a public client for read-only operations (like checking nonce or allowance)
        const publicClient = createPublicClient({
            transport: http(this.rpcUrl!),
        });

        // Adapt viem Account to ClientEvmSigner
        const baseSigner = {
            address: this.account!.address,
            signTypedData: async (args: any) => {
                if (!this.account!.signTypedData) {
                    throw new Error('Account must support signTypedData for x402 payments');
                }
                return this.account!.signTypedData(args);
            }
        };

        const signer = toClientEvmSigner(baseSigner, publicClient);
        
        // Initialize the Exact EVM Scheme client
        const schemeClient = new ExactEvmScheme(signer);

        // Create the payment payload
        const payloadResult = await schemeClient.createPaymentPayload(1, reqs);
        
        // Return base64 encoded payload as the signature header
        return Buffer.from(JSON.stringify(payloadResult.payload)).toString('base64');
    }

    /**
     * Register an output in RxM by providing its pre-computed SHA-256 hash.
     * This avoids hashing the content client-side or transmitting the raw payload.
     * 
     * @param contentHash - Pre-computed SHA-256 hash (must start with 'sha256:')
     * @param options - Record options (omitting contentHash)
     * @returns Receipt with recordId, state, receiptHash
     */
    async recordHash(contentHash: string, options: Omit<RecordOptions, 'contentHash'>): Promise<Receipt> {
        this.assertWritable('recordHash');
        return this.record('', { ...options, contentHash });
    }

    /**
     * Register a batch of outputs (up to 100).
     * v0.1: each item MUST have feeTxHash (BYO mode).
     */
    async recordBatch(items: BatchItem[]): Promise<BatchResult> {
        this.assertWritable('recordBatch');

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
                    agent_wallet: this.account!.address,
                    model_id: item.options.modelId,
                    runtime_id: item.options.runtimeId ?? detectRuntime(),
                    process_type: item.options.processType ?? 'direct',
                    human_intervention_level: item.options.humanInterventionLevel ?? 0,
                    pipeline_steps: item.options.pipelineSteps ?? 1,
                    timestamp,
                    nonce,
                };

                const signature = await signPoGBundle(this.account!, pogMessage);

                return {
                    pog_bundle: {
                        schema: 'pog.v1',
                        content_hash: contentHash,
                        agent_wallet: this.account!.address,
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
     * Available in both writable and read-only modes.
     */
    async verify(contentOrHash: string): Promise<VerifyResult> {
        const hash = contentOrHash.startsWith('sha256:')
            ? contentOrHash
            : await computeContentHash(contentOrHash);

        return this.http.get<VerifyResult>(`/v1/records/verify?content_hash=${encodeURIComponent(hash)}`);
    }

    /**
     * Get record details by ID.
     * Available in both writable and read-only modes.
     */
    async getRecord(recordId: string): Promise<RecordDetail> {
        return this.http.get<RecordDetail>(`/v1/records/${recordId}`);
    }

    /**
     * Export an offline-verifiable receipt.
     * Available in both writable and read-only modes.
     */
    async export(recordId: string): Promise<ExportData> {
        return this.http.get<ExportData>(`/v1/records/${recordId}/export`);
    }

    /**
     * List records with filters.
     *
     * In writable mode: defaults to the client's account address.
     * In read-only mode: `agentWallet` is required.
     * In writable mode: `agentWallet` can query another wallet (endpoint is public).
     */
    async listRecords(options?: ListRecordsOptions): Promise<ListRecordsResult> {
        let wallet: string;

        if (options?.agentWallet) {
            // Explicit wallet — works in both modes
            wallet = options.agentWallet;
        } else if (this.account) {
            // Writable mode — default to own wallet
            wallet = this.account.address;
        } else {
            // Read-only mode without agentWallet
            throw new RxMValidationError(
                'listRecords() requires agentWallet when the client is initialized in read-only mode.',
                { code: 'missing_agent_wallet' },
            );
        }

        const params = new URLSearchParams();
        params.set('agent_wallet', wallet);
        if (options?.state) params.set('state', options.state);
        if (options?.limit) params.set('limit', options.limit.toString());
        if (options?.offset) params.set('offset', options.offset.toString());
        if (options?.sort) params.set('sort', options.sort);

        return this.http.get<ListRecordsResult>(`/v1/records?${params.toString()}`);
    }

    // ─── POLLING ──────────────────────────────────────────────

    /**
     * Wait for a record to be anchored on-chain (polling).
     * Available in both writable and read-only modes (read-only polling).
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
