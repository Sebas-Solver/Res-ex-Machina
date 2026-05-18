// SPDX-License-Identifier: Apache-2.0
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { getConfig } from '../config.js';
import { Ledger, LedgerStats, GuardrailResult, BatchJobStatus, BatchItemRecord, BatchJobResult, AuditEvent, AuditEventType } from './Ledger.js';

export class SqliteLedger implements Ledger {
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

      CREATE TABLE IF NOT EXISTS failed_attempts (
        id TEXT PRIMARY KEY,
        reason TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS batch_jobs (
        batch_id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        total_items INTEGER NOT NULL,
        new_items INTEGER NOT NULL,
        duplicate_items INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        estimated_cost_wei TEXT NOT NULL DEFAULT '0',
        actual_cost_wei TEXT NOT NULL DEFAULT '0'
      );

      CREATE TABLE IF NOT EXISTS batch_items (
        batch_id TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        record_id TEXT,
        fee_tx_hash TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        error_code TEXT,
        PRIMARY KEY (batch_id, content_hash),
        FOREIGN KEY (batch_id) REFERENCES batch_jobs(batch_id)
      );

      CREATE TABLE IF NOT EXISTS audit_events (
        event_id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        actor_wallet TEXT,
        actor_type TEXT NOT NULL,
        previous_value TEXT,
        new_value TEXT NOT NULL,
        reason TEXT NOT NULL,
        request_id TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_type ON audit_events(event_type);
      CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(created_at);
    `);
  }

  public recordTransaction(recordId: string, txHash: string, amountWei: bigint, gasWei: bigint): void {
    const stmt = this.db.prepare(`
      INSERT INTO spending_log (id, tx_hash, amount_wei, gas_wei, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    stmt.run(recordId, txHash, amountWei.toString(), gasWei.toString(), Date.now());
  }

  public recordFailedAttempt(recordId: string, reason: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO failed_attempts (id, reason, timestamp)
      VALUES (?, ?, ?)
    `);
    
    stmt.run(recordId, reason, Date.now());
  }

  public getDailyStats(): LedgerStats {
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

  public checkGuardrails(predictedFeeWei: bigint, predictedGasWei: bigint): GuardrailResult {
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

  public checkBatchGuardrails(itemCount: number, perItemFeeWei: bigint, perItemGasWei: bigint): GuardrailResult {
    const config = getConfig();

    // Per-item limits still apply
    if (perItemFeeWei > BigInt(config.MCP_MAX_RXM_FEE_WEI)) {
      return { allowed: false, reason: `Per-item fee (${perItemFeeWei}) exceeds MCP_MAX_RXM_FEE_WEI (${config.MCP_MAX_RXM_FEE_WEI})` };
    }
    if (perItemGasWei > BigInt(config.MCP_MAX_GAS_COST_WEI)) {
      return { allowed: false, reason: `Per-item gas (${perItemGasWei}) exceeds MCP_MAX_GAS_COST_WEI (${config.MCP_MAX_GAS_COST_WEI})` };
    }

    const totalBatchCost = (perItemFeeWei + perItemGasWei) * BigInt(itemCount);
    const { totalSpentWei, recordsCount } = this.getDailyStats();

    // Check daily records limit (existing + new items)
    if (recordsCount + itemCount > config.MCP_MAX_RECORDS_PER_DAY) {
      return { allowed: false, reason: `Batch of ${itemCount} would exceed daily record limit (${recordsCount} used / ${config.MCP_MAX_RECORDS_PER_DAY} max)` };
    }

    // Check daily spend limit
    const newDailyTotal = totalSpentWei + totalBatchCost;
    if (newDailyTotal > BigInt(config.MCP_MAX_SPEND_PER_DAY_WEI)) {
      return { allowed: false, reason: `Batch cost would exceed daily spend limit. Current: ${totalSpentWei}, Batch: ${totalBatchCost}, Max: ${config.MCP_MAX_SPEND_PER_DAY_WEI}` };
    }

    return { allowed: true };
  }

  // ─── Batch Operations ──────────────────────────────────────

  public createBatchJob(batchId: string, totalItems: number, newItems: number, duplicateItems: number, estimatedCostWei: bigint): void {
    const stmt = this.db.prepare(`
      INSERT INTO batch_jobs (batch_id, created_at, total_items, new_items, duplicate_items, status, estimated_cost_wei, actual_cost_wei)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, '0')
    `);
    stmt.run(batchId, Date.now(), totalItems, newItems, duplicateItems, estimatedCostWei.toString());
  }

  public updateBatchJobStatus(batchId: string, status: BatchJobStatus, actualCostWei?: bigint): void {
    if (actualCostWei !== undefined) {
      const stmt = this.db.prepare(`UPDATE batch_jobs SET status = ?, actual_cost_wei = ? WHERE batch_id = ?`);
      stmt.run(status, actualCostWei.toString(), batchId);
    } else {
      const stmt = this.db.prepare(`UPDATE batch_jobs SET status = ? WHERE batch_id = ?`);
      stmt.run(status, batchId);
    }
  }

  public addBatchItem(item: BatchItemRecord): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO batch_items (batch_id, content_hash, record_id, fee_tx_hash, status, error_code)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(item.batchId, item.contentHash, item.recordId, item.feeTxHash, item.status, item.errorCode);
  }

  public getBatchJob(batchId: string): BatchJobResult | null {
    const jobStmt = this.db.prepare(`SELECT * FROM batch_jobs WHERE batch_id = ?`);
    const jobRow = jobStmt.get(batchId) as any;
    if (!jobRow) return null;

    const itemsStmt = this.db.prepare(`SELECT * FROM batch_items WHERE batch_id = ?`);
    const itemRows = itemsStmt.all(batchId) as any[];

    return {
      job: {
        batchId: jobRow.batch_id,
        createdAt: jobRow.created_at,
        totalItems: jobRow.total_items,
        newItems: jobRow.new_items,
        duplicateItems: jobRow.duplicate_items,
        status: jobRow.status,
        estimatedCostWei: jobRow.estimated_cost_wei,
        actualCostWei: jobRow.actual_cost_wei,
      },
      items: itemRows.map((r: any) => ({
        batchId: r.batch_id,
        contentHash: r.content_hash,
        recordId: r.record_id,
        feeTxHash: r.fee_tx_hash,
        status: r.status,
        errorCode: r.error_code,
      })),
    };
  }

  // ─── Audit Events (P0-2) ──────────────────────────────────

  public recordAuditEvent(event: Omit<AuditEvent, 'createdAt'>): void {
    const stmt = this.db.prepare(`
      INSERT INTO audit_events (event_id, event_type, actor_wallet, actor_type, previous_value, new_value, reason, request_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      event.eventId,
      event.eventType,
      event.actorWallet,
      event.actorType,
      event.previousValue,
      event.newValue,
      event.reason,
      event.requestId,
      Date.now()
    );
  }

  public getAuditEvents(eventType?: AuditEventType, limit = 50): AuditEvent[] {
    let query = 'SELECT * FROM audit_events';
    const params: any[] = [];
    if (eventType) {
      query += ' WHERE event_type = ?';
      params.push(eventType);
    }
    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map((r: any) => ({
      eventId: r.event_id,
      eventType: r.event_type,
      actorWallet: r.actor_wallet,
      actorType: r.actor_type,
      previousValue: r.previous_value,
      newValue: r.new_value,
      reason: r.reason,
      requestId: r.request_id,
      createdAt: r.created_at,
    }));
  }

  public close(): void {
    this.db.close();
  }
}
