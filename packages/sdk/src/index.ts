/**
 * @res-ex-machina/sdk — Official Res ex Machina SDK
 *
 * Neutral registry for AI-generated content provenance.
 * Works with any provider: OpenAI, Anthropic, Google, local models.
 *
 * @example
 * ```typescript
 * import { RxMClient } from '@res-ex-machina/sdk';
 * import { privateKeyToAccount } from 'viem/accounts';
 *
 * const account = privateKeyToAccount('0x...');
 * const rxm = new RxMClient({
 *   account,
 *   rpcUrl: 'https://sepolia.base.org',
 *   apiUrl: 'https://res-ex-machina-api.onrender.com',
 *   feeReceiverAddress: '0x...',
 * });
 *
 * const receipt = await rxm.record('AI-generated content', {
 *   modelId: 'openai:gpt-4o:2026-01',
 * });
 * ```
 *
 * @packageDocumentation
 */

// ─── Main class ────────────────────────────────────────────────
export { RxMClient } from './client.js';

// ─── Public types ──────────────────────────────────────────────
export type {
    RxMClientOptions,
    RecordOptions,
    ProcessType,
    Visibility,
    Receipt,
    BatchItem,
    BatchResult,
    BatchResultItem,
    VerifyResult,
    RecordDetail,
    ExportData,
    ListRecordsOptions,
    ListRecordsResult,
    Webhook,
    WebhookRegistration,
    WebhookListResult,
} from './types.js';

// ─── Typed errors ──────────────────────────────────────────────
export {
    RxMError,
    RxMRateLimitError,
    RxMNetworkError,
    RxMValidationError,
} from './errors.js';

// ─── Utilities (for advanced integrators) ──────────────────────
export { computeContentHash } from './hash.js';
export { signPoGBundle, EIP712_DOMAIN, EIP712_TYPES } from './sign.js';
export type { PoGSignatureMessage } from './sign.js';
