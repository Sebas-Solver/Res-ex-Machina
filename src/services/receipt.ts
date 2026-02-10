import { createHash } from 'node:crypto';

/**
 * Computa el receipt_hash de un record.
 *
 * El receipt_hash es una huella SHA-256 que vincula de forma determinista:
 *   record_id + content_hash + agent_wallet + nonce + created_at
 *
 * Se usa como ancla: el receipt_hash es lo que se graba on-chain.
 * Cualquiera puede recalcularlo para verificar integridad.
 *
 * @returns `sha256:{64hex}`
 */
export function computeReceiptHash(
    recordId: string,
    contentHash: string,
    agentWallet: string,
    nonce: string,
    createdAt: Date,
): string {
    // Concatenar en orden canónico con separador '|'
    const canonical = [
        recordId,
        contentHash,
        agentWallet.toLowerCase(),
        nonce,
        createdAt.toISOString(),
    ].join('|');

    const hash = createHash('sha256').update(canonical).digest('hex');
    return `sha256:${hash}`;
}
