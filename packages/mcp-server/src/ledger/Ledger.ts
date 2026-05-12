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

export interface Ledger {
  recordTransaction(recordId: string, txHash: string, amountWei: bigint, gasWei: bigint): void;
  recordFailedAttempt(recordId: string, reason: string): void;
  getDailyStats(): LedgerStats;
  checkGuardrails(predictedFeeWei: bigint, predictedGasWei: bigint): GuardrailResult;
  close(): void;
}
