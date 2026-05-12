import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { getConfig } from './config';

export interface SpendingRecord {
  id: string;
  tx_hash: string;
  amount_wei: string;
  gas_wei: string;
  timestamp: number;
}

export class Ledger {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const config = getConfig();
    const finalPath = dbPath || config.MCP_SPEND_STATE_PATH;
    
    // Ensure directory exists
    const dir = path.dirname(finalPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(finalPath);
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS spending_log (
        id TEXT PRIMARY KEY,
        tx_hash TEXT NOT NULL,
        amount_wei TEXT NOT NULL,
        gas_wei TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_timestamp ON spending_log(timestamp);
    `);
  }

  public recordTransaction(recordId: string, txHash: string, amountWei: bigint, gasWei: bigint) {
    const stmt = this.db.prepare(`
      INSERT INTO spending_log (id, tx_hash, amount_wei, gas_wei, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    stmt.run(recordId, txHash, amountWei.toString(), gasWei.toString(), Date.now());
  }

  public getDailyStats(): { totalSpentWei: bigint, recordsCount: number } {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    
    const stmt = this.db.prepare(`
      SELECT amount_wei, gas_wei 
      FROM spending_log 
      WHERE timestamp >= ?
    `);
    
    const records = stmt.all(oneDayAgo) as { amount_wei: string, gas_wei: string }[];
    
    let totalSpentWei = 0n;
    for (const record of records) {
      totalSpentWei += BigInt(record.amount_wei) + BigInt(record.gas_wei);
    }
    
    return {
      totalSpentWei,
      recordsCount: records.length
    };
  }

  public checkGuardrails(predictedFeeWei: bigint, predictedGasWei: bigint): { allowed: boolean; reason?: string } {
    const config = getConfig();
    const totalCostWei = predictedFeeWei + predictedGasWei;

    // Check individual tx limits
    if (predictedFeeWei > BigInt(config.MCP_MAX_RXM_FEE_WEI)) {
      return { allowed: false, reason: `Predicted fee (${predictedFeeWei}) exceeds MCP_MAX_RXM_FEE_WEI (${config.MCP_MAX_RXM_FEE_WEI})` };
    }
    
    if (predictedGasWei > BigInt(config.MCP_MAX_GAS_COST_WEI)) {
      return { allowed: false, reason: `Predicted gas (${predictedGasWei}) exceeds MCP_MAX_GAS_COST_WEI (${config.MCP_MAX_GAS_COST_WEI})` };
    }

    if (totalCostWei > BigInt(config.MCP_MAX_TOTAL_TX_COST_WEI)) {
      return { allowed: false, reason: `Total cost (${totalCostWei}) exceeds MCP_MAX_TOTAL_TX_COST_WEI (${config.MCP_MAX_TOTAL_TX_COST_WEI})` };
    }

    // Check daily limits
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

  public close() {
    this.db.close();
  }
}
