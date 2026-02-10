/**
 * BullMQ Anchor Worker.
 *
 * Worker asíncrono que procesa jobs de anchoring on-chain.
 * Toma records en estado `pending_anchor` y los ancla en la L2.
 *
 * TODO: Issue #6 — Implementar worker completo
 *
 * Config (ADR-001):
 * - Retries: 3
 * - Backoff: exponencial (5s → 10s → 20s)
 * - Al agotar retries: state = anchor_failed
 * - El worker DEBE ser idempotente
 *
 * Referencia:
 * - ADR-001 (BullMQ config)
 * - PRD v1.1 sección H.2
 * - INV-019 (record válido con anchor_failed)
 */

// TODO: Issue #6 — Implementar anchor worker con BullMQ
