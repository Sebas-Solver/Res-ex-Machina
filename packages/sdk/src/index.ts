/**
 * @rxm/sdk — SDK oficial de Res ex Machina
 *
 * Registro neutral de hechos de generación por IA.
 * Funciona con cualquier proveedor: OpenAI, Anthropic, Google, modelos locales.
 *
 * @example
 * ```typescript
 * import { RxMClient } from '@rxm/sdk';
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

// ─── Clase principal ───────────────────────────────────────────
export { RxMClient } from './client.js';

// ─── Tipos públicos ────────────────────────────────────────────
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

// ─── Errores tipados ───────────────────────────────────────────
export {
    RxMError,
    RxMRateLimitError,
    RxMNetworkError,
    RxMValidationError,
} from './errors.js';

// ─── Utilidades (para integradores avanzados) ──────────────────
export { computeContentHash } from './hash.js';
export { signPoGBundle, EIP712_DOMAIN, EIP712_TYPES } from './sign.js';
export type { PoGSignatureMessage } from './sign.js';
