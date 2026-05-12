import { getConfig } from '../config.js';
import { Ledger, LedgerStats, GuardrailResult, SpendingRecord, FailedAttemptRecord } from './Ledger.js';

export class MemoryLedger implements Ledger {
  private spendingLogs: SpendingRecord[] = [];
  private failedAttempts: FailedAttemptRecord[] = [];

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

  public close(): void {
    // No-op for memory
  }
}
