/**
 * Servicio de verificación de fee on-chain.
 *
 * Verifica que la transacción de pago (fee_tx_hash) es válida:
 * - Existe y está confirmada
 * - Monto >= fee mínimo
 * - Destinatario correcto
 * - No reutilizada
 * - No demasiado antigua
 *
 * TODO: Issue #4 — Implementar verificación completa
 *
 * Referencia:
 * - Docs/10-specs/fee-flow-v1.md
 * - INV-012, INV-020
 */

export async function verifyFee(
    _feeTxHash: string,
): Promise<{ valid: boolean; error?: string }> {
    // TODO: Issue #4
    throw new Error('verifyFee no implementado (Issue #4)');
}
