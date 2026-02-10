/**
 * Servicio de cálculo de receipt_hash.
 *
 * El receipt_hash es un hash SHA-256 del receipt completo del registro,
 * incluyendo: record_id, content_hash, pog_bundle, created_at.
 *
 * TODO: Issue #3 — Implementar cálculo real
 */

export function computeReceiptHash(
    _recordId: string,
    _contentHash: string,
    _pogBundle: unknown,
    _createdAt: Date,
): string {
    // TODO: Issue #3
    throw new Error('computeReceiptHash no implementado (Issue #3)');
}
