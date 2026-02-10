/**
 * Servicio de anchoring on-chain.
 *
 * Gestiona el envío de transacciones de anchoring a la blockchain L2.
 * Usado por el anchor worker (BullMQ).
 *
 * TODO: Issue #6 — Implementar anchoring real
 *
 * Referencia:
 * - PRD v1.1 sección H.2 (unhappy path)
 * - ADR-001 (BullMQ con retries/backoff)
 * - INV-019 (record válido incluso con anchor_failed)
 */

export async function anchorRecord(
    _recordId: string,
    _contentHash: string,
    _receiptHash: string,
): Promise<{ txHash: string; block: number; chainId: number }> {
    // TODO: Issue #6
    throw new Error('anchorRecord no implementado (Issue #6)');
}
