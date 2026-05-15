import { getConfig } from '../config.js';
import { Ledger, LedgerStats, GuardrailResult, SpendingRecord, FailedAttemptRecord, BatchJobStatus, BatchItemRecord, BatchJobResult, BatchJob, AuditEvent, AuditEventType } from './Ledger.js';

export class MemoryLedger implements Ledger {
  private spendingLogs: SpendingRecord[] = [];
  private failedAttempts: FailedAttemptRecord[] = [];
  private batchJobs: Map<string, BatchJob> = new Map();
  private batchItems: Map<string, BatchItemRecord[]> = new Map();
  private auditEvents: AuditEvent[] = [];

  public recordTransaction(recordId: string, txHash: string, amountWei: bigint, gasWei: bigint): void {
    this.spendingLogs.push({
      id: recordId,
      tx_hash: txHash,
      amount_wei: amountWei.toString(),
      gas_wei: gasWei.toString(),
      timestamp: Date.now()
    });
  }

  public recordFailedAttempt(recordId: string, reason: string): void {
    this.failedAttempts.push({
      id: recordId,
      reason,
      timestamp: Date.now()
    });
  }

  public getDailyStats(): LedgerStats {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    
    const records = this.spendingLogs.filter(log => log.timestamp >= oneDayAgo);
    
    let totalSpentWei = 0n;
    for (const record of records) {
      totalSpentWei += BigInt(record.amount_wei) + BigInt(record.gas_wei);
    }
    
    return {
      totalSpentWei,
      recordsCount: records.length
    };
  }

  public checkGuardrails(predictedFeeWei: bigint, predictedGasWei: bigint): GuardrailResult {
    const config = getConfig();
    const totalCostWei = predictedFeeWei + predictedGasWei;

    if (predictedFeeWei > BigInt(config.MCP_MAX_RXM_FEE_WEI)) {
      return { allowed: false, reason: `Predicted fee (${predictedFeeWei}) exceeds MCP_MAX_RXM_FEE_WEI (${config.MCP_MAX_RXM_FEE_WEI})` };
    }
    
    if (predictedGasWei > BigInt(config.MCP_MAX_GAS_COST_WEI)) {
      return { allowed: false, reason: `Predicted gas (${predictedGasWei}) exceeds MCP_MAX_GAS_COST_WEI (${config.MCP_MAX_GAS_COST_WEI})` };
    }

    if (totalCostWei > BigInt(config.MCP_MAX_TOTAL_TX_COST_WEI)) {
      return { allowed: false, reason: `Total cost (${totalCostWei}) exceeds MCP_MAX_TOTAL_TX_COST_WEI (${config.MCP_MAX_TOTAL_TX_COST_WEI})` };
    }

    const { totalSpentWei, recordsCount } = this.getDailyStats();

    if (recordsCount >= config.MCP_MAX_RECORDS_PER_DAY) {
      return { allowed: false, reason: `Daily record limit reached (${recordsCount} / ${config.MCP_MAX_RECORDS_PER_DAY})` };
    }

    const newDailyTotal = totalSpentWei + totalCostWei;
    if (newDailyTotal > BigInt(config.MCP_MAX_SPEND_PER_DAY_WEI)) {
      return { allowed: false, reason: `Daily spend limit would be exceeded. Current: ${totalSpentWei}, New: ${newDailyTotal}, Max: ${config.MCP_MAX_SPEND_PER_DAY_WEI}` };
    }

    return { allowed: true };
  }

  public checkBatchGuardrails(itemCount: number, perItemFeeWei: bigint, perItemGasWei: bigint): GuardrailResult {
    const config = getConfig();

    if (perItemFeeWei > BigInt(config.MCP_MAX_RXM_FEE_WEI)) {
      return { allowed: false, reason: `Per-item fee (${perItemFeeWei}) exceeds MCP_MAX_RXM_FEE_WEI (${config.MCP_MAX_RXM_FEE_WEI})` };
    }
    if (perItemGasWei > BigInt(config.MCP_MAX_GAS_COST_WEI)) {
      return { allowed: false, reason: `Per-item gas (${perItemGasWei}) exceeds MCP_MAX_GAS_COST_WEI (${config.MCP_MAX_GAS_COST_WEI})` };
    }

    const totalBatchCost = (perItemFeeWei + perItemGasWei) * BigInt(itemCount);
    const { totalSpentWei, recordsCount } = this.getDailyStats();

    if (recordsCount + itemCount > config.MCP_MAX_RECORDS_PER_DAY) {
      return { allowed: false, reason: `Batch of ${itemCount} would exceed daily record limit (${recordsCount} used / ${config.MCP_MAX_RECORDS_PER_DAY} max)` };
    }

    const newDailyTotal = totalSpentWei + totalBatchCost;
    if (newDailyTotal > BigInt(config.MCP_MAX_SPEND_PER_DAY_WEI)) {
      return { allowed: false, reason: `Batch cost would exceed daily spend limit. Current: ${totalSpentWei}, Batch: ${totalBatchCost}, Max: ${config.MCP_MAX_SPEND_PER_DAY_WEI}` };
    }

    return { allowed: true };
  }

  // ─── Batch Operations ──────────────────────────────────────

  public createBatchJob(batchId: string, totalItems: number, newItems: number, duplicateItems: number, estimatedCostWei: bigint): void {
    this.batchJobs.set(batchId, {
      batchId,
      createdAt: Date.now(),
      totalItems,
      newItems,
      duplicateItems,
      status: 'pending',
      estimatedCostWei: estimatedCostWei.toString(),
      actualCostWei: '0',
    });
    this.batchItems.set(batchId, []);
  }

  public updateBatchJobStatus(batchId: string, status: BatchJobStatus, actualCostWei?: bigint): void {
    const job = this.batchJobs.get(batchId);
    if (job) {
      job.status = status;
      if (actualCostWei !== undefined) {
        job.actualCostWei = actualCostWei.toString();
      }
    }
  }

  public addBatchItem(item: BatchItemRecord): void {
    const items = this.batchItems.get(item.batchId) || [];
    const existingIdx = items.findIndex(i => i.contentHash === item.contentHash);
    if (existingIdx >= 0) {
      items[existingIdx] = item;
    } else {
      items.push(item);
    }
    this.batchItems.set(item.batchId, items);
  }

  public getBatchJob(batchId: string): BatchJobResult | null {
    const job = this.batchJobs.get(batchId);
    if (!job) return null;
    return {
      job,
      items: this.batchItems.get(batchId) || [],
    };
  }

  // ─── Audit Events (P0-2) ──────────────────────────────────

  public recordAuditEvent(event: Omit<AuditEvent, 'createdAt'>): void {
    this.auditEvents.push({
      ...event,
      createdAt: Date.now(),
    });
  }

  public getAuditEvents(eventType?: AuditEventType, limit = 50): AuditEvent[] {
    let events = this.auditEvents;
    if (eventType) {
      events = events.filter(e => e.eventType === eventType);
    }
    return events.slice(-limit).reverse();
  }

  public close(): void {
    // No-op for memory
  }
}
