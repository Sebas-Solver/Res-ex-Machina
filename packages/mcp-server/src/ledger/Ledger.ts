// SPDX-License-Identifier: Apache-2.0
export interface SpendingRecord {
  id: string;
  tx_hash: string;
  amount_wei: string;
  gas_wei: string;
  timestamp: number;
}

export interface FailedAttemptRecord {
  id: string;
  reason: string;
  timestamp: number;
}

export interface GuardrailResult {
  allowed: boolean;
  reason?: string;
}

export interface LedgerStats {
  totalSpentWei: bigint;
  recordsCount: number;
}

// ─── Batch Types ──────────────────────────────────────────

export type BatchJobStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type BatchItemStatus = 'pending' | 'success' | 'failed' | 'duplicate';

export interface BatchJob {
  batchId: string;
  createdAt: number;
  totalItems: number;
  newItems: number;
  duplicateItems: number;
  status: BatchJobStatus;
  estimatedCostWei: string;
  actualCostWei: string;
}

export interface BatchItemRecord {
  batchId: string;
  contentHash: string;
  recordId: string | null;
  feeTxHash: string | null;
  status: BatchItemStatus;
  errorCode: string | null;
}

export interface BatchJobResult {
  job: BatchJob;
  items: BatchItemRecord[];
}

// ─── Audit Events (P0-2 remediation) ──────────────────────────

export type AuditEventType = 'confirmation_mode_change' | 'confirmation_mode_reset';
export type ActorType = 'agent' | 'operator' | 'system';

export interface AuditEvent {
  eventId: string;
  eventType: AuditEventType;
  actorWallet: string | null;
  actorType: ActorType;
  previousValue: string | null;
  newValue: string;
  reason: string;
  requestId: string | null;
  createdAt: number;
}

// ─── Ledger Interface ─────────────────────────────────────

export interface Ledger {
  // Single record operations
  recordTransaction(recordId: string, txHash: string, amountWei: bigint, gasWei: bigint): void;
  recordFailedAttempt(recordId: string, reason: string): void;
  getDailyStats(): LedgerStats;
  checkGuardrails(predictedFeeWei: bigint, predictedGasWei: bigint): GuardrailResult;
  /** Check guardrails for N items at once (validates total cost + daily limits for the batch). */
  checkBatchGuardrails(itemCount: number, perItemFeeWei: bigint, perItemGasWei: bigint): GuardrailResult;

  // Batch operations
  createBatchJob(batchId: string, totalItems: number, newItems: number, duplicateItems: number, estimatedCostWei: bigint): void;
  updateBatchJobStatus(batchId: string, status: BatchJobStatus, actualCostWei?: bigint): void;
  addBatchItem(item: BatchItemRecord): void;
  getBatchJob(batchId: string): BatchJobResult | null;

  // Audit events (P0-2)
  recordAuditEvent(event: Omit<AuditEvent, 'createdAt'>): void;
  getAuditEvents(eventType?: AuditEventType, limit?: number): AuditEvent[];

  close(): void;
}

