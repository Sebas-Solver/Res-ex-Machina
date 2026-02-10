/**
 * Servicio de verificación de firma EIP-712.
 *
 * Usa la librería `viem` para verificar que la firma del PoG bundle
 * corresponde al agent_wallet declarado.
 *
 * TODO: Issue #3 — Implementar verificación completa
 *
 * Referencia:
 * - Docs/10-specs/pog-v1-spec.md
 * - ADR-001 (viem para EIP-712)
 */

export async function verifySignature(
    _pogBundle: unknown,
    _signature: string,
): Promise<{ valid: boolean; recoveredAddress?: string }> {
    // TODO: Issue #3
    throw new Error('verifySignature no implementado (Issue #3)');
}
