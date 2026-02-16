import { env } from '../config/env.js';
import { getStateInfo } from './stateInfo.js';
import { getExplorerTxUrl, getNetworkName } from './explorer.js';
import type { records } from '../db/schema.js';

/**
 * Formatters de respuesta para la API.
 *
 * Extraídos de routes/records.ts para reutilización (Issue #18).
 * Incluyen links auto-generados (Issue #20).
 */

type DbRecord = typeof records.$inferSelect;

/**
 * Dominio EIP-712 que se incluye en el export para verificación offline.
 * Debe coincidir con signature.ts.
 */
const EXPORTED_EIP712_DOMAIN = {
    name: 'ResExMachina',
    version: '1',
    chain_id: 0,
    verifying_contract: '0x0000000000000000000000000000000000000000',
} as const;

// --- Bloques internos ---

/**
 * Construye el bloque anchor con explorer_url y network_name.
 */
export function buildAnchorBlock(record: DbRecord) {
    if (!record.anchorTxHash) return null;
    const chainId = record.anchorChainId ?? env.L2_CHAIN_ID;
    return {
        tx_hash: record.anchorTxHash,
        block: record.anchorBlock,
        chain_id: chainId,
        anchored_at: record.anchoredAt?.toISOString() ?? null,
        anchored_hash: record.receiptHash,
        anchor_method: 'calldata' as const,
        network_name: getNetworkName(chainId),
        explorer_url: getExplorerTxUrl(chainId, record.anchorTxHash),
    };
}

/**
 * Construye el bloque fee con explorer_url y network_name.
 */
export function buildFeeBlock(record: DbRecord) {
    return {
        amount: record.feeAmount,
        currency: record.feeCurrency,
        tx_hash: record.feeTxHash,
        block: record.feeBlock ?? null,
        confirmed_at: record.feeConfirmedAt?.toISOString() ?? null,
        chain_id: env.L2_CHAIN_ID,
        to: env.FEE_RECEIVER_ADDRESS,
        network_name: getNetworkName(env.L2_CHAIN_ID),
        explorer_url: getExplorerTxUrl(env.L2_CHAIN_ID, record.feeTxHash),
    };
}

/**
 * Construye el bloque links con URLs auto-generadas (Issue #20).
 *
 * - self: URL para consultar este record
 * - export: URL para exportar el receipt
 * - verify: URL para verificar por content_hash
 *
 * Usa API_BASE_URL si está definida, sino construye desde localhost:PORT.
 */
export function buildLinks(record: DbRecord) {
    const baseUrl = env.API_BASE_URL ?? `http://localhost:${env.PORT}`;
    const recordUrl = `${baseUrl}/v1/records/${record.recordId}`;

    return {
        self: recordUrl,
        export: `${recordUrl}/export`,
        verify: `${baseUrl}/v1/records/verify?content_hash=${record.contentHash}`,
    };
}

// --- Formatos de respuesta ---

/**
 * Formatea un record de la DB para la respuesta API.
 * Incluye state_info, explorer_url, network_name y links.
 */
export function formatRecordResponse(record: DbRecord) {
    return {
        record_id: record.recordId,
        content_hash: record.contentHash,
        content_type: record.contentType,
        visibility: record.visibility,
        pog_bundle: record.pogBundle,
        nonce: record.nonce,
        agent_wallet: record.agentWallet,
        state: record.state,
        state_info: getStateInfo(record.state),
        created_at: record.createdAt.toISOString(),
        receipt_hash: record.receiptHash,
        tags: record.tags,
        external_ref: record.externalRef,
        provenance_metadata: record.provenanceMetadata ?? null,
        fee: buildFeeBlock(record),
        anchor: buildAnchorBlock(record),
        links: buildLinks(record),
    };
}

/**
 * Formatea el export completo (mode=full, default).
 * Incluye toda la info para verificación offline + links.
 */
export function formatFullExport(record: DbRecord) {
    return {
        schema: 'rex.receipt.v1',
        spec_version: '1.2',
        record_id: record.recordId,
        content_hash: record.contentHash,
        content_type: record.contentType,
        visibility: record.visibility,
        pog_bundle: {
            ...record.pogBundle as object,
            eip712_domain: EXPORTED_EIP712_DOMAIN,
        },
        receipt_hash: record.receiptHash,
        verification: {
            receipt_hash_algo: 'sha256',
            receipt_canonicalization: 'pipe-separated',
            receipt_fields: 'record_id|content_hash|agent_wallet_lowercase|nonce|created_at_iso8601',
            eip712_primary_type: 'PoGBundle',
        },
        created_at: record.createdAt.toISOString(),
        state: record.state,
        state_info: getStateInfo(record.state),
        provenance_metadata: record.provenanceMetadata ?? null,
        temporal_attestation: {
            blockchain_timestamp: record.anchoredAt?.toISOString() ?? null,
            pki_timestamp: (record.provenanceMetadata as Record<string, unknown> | null)?.pki_timestamp ?? null,
            sources: [
                'blockchain_anchor',
                ...((record.provenanceMetadata as Record<string, unknown> | null)?.pki_timestamp ? ['pki_standard'] : []),
            ],
        },
        fee: buildFeeBlock(record),
        anchor: buildAnchorBlock(record),
        links: buildLinks(record),
    };
}

/**
 * Formatea el export compacto (mode=compact).
 * Solo incluye los campos necesarios para verificación criptográfica.
 * Optimizado para contextos de LLM donde cada token cuenta.
 * No incluye links (ahorro de tokens).
 */
export function formatCompactExport(record: DbRecord) {
    const pogBundle = record.pogBundle as Record<string, unknown>;
    return {
        schema: 'rex.receipt.v1',
        spec_version: '1.2',
        record_id: record.recordId,
        content_hash: record.contentHash,
        receipt_hash: record.receiptHash,
        state: record.state,
        state_info: getStateInfo(record.state),
        created_at: record.createdAt.toISOString(),
        pog_bundle: {
            agent_wallet: pogBundle.agent_wallet,
            nonce: pogBundle.nonce,
            signature: pogBundle.signature,
            content_hash: pogBundle.content_hash,
        },
        verification: {
            receipt_hash_algo: 'sha256',
            receipt_canonicalization: 'pipe-separated',
            receipt_fields: 'record_id|content_hash|agent_wallet_lowercase|nonce|created_at_iso8601',
            eip712_primary_type: 'PoGBundle',
        },
        anchor: buildAnchorBlock(record),
    };
}
