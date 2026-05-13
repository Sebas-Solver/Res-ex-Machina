// SPDX-License-Identifier: Apache-2.0

import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { paymentAttempts, records } from '../db/schema.js';
import type { PaymentEvidence } from '../types/payment.js';
import type { PaymentAttempt } from '../db/schema.js';
import { verifyFee } from './fee.js';
import { ApiError } from '../utils/errors.js';

export type PreCheckResult =
  | { status: 'duplicate_conflict'; recordId: string }
  | { status: 'cached_response'; recordData: any }
  | { status: 'proceed' };

export class PaymentVerifier {
  /**
   * Maneja deduplicación y cacheo antes del pago.
   */
  async preCheck(contentHash: string, paymentIdentifier?: string): Promise<PreCheckResult> {
    // 1. Check if record with contentHash exists
    const existingRecord = await db.select().from(records).where(eq(records.contentHash, contentHash)).limit(1);

    if (existingRecord.length > 0) {
      const record = existingRecord[0];
      
      // Si paymentIdentifier existe y coincide con el attempt usado, es un reintento idempotente exitoso
      if (paymentIdentifier && record.paymentAttemptId) {
        const attempt = await db.select().from(paymentAttempts).where(eq(paymentAttempts.id, record.paymentAttemptId)).limit(1);
        if (attempt.length > 0 && attempt[0].paymentIdentifier === paymentIdentifier) {
          return { status: 'cached_response', recordData: record };
        }
      }
      
      // De lo contrario, es un conflicto (duplicado)
      return { status: 'duplicate_conflict', recordId: record.recordId };
    }

    return { status: 'proceed' };
  }

  /**
   * Verifica y liquida el pago.
   */
  async verifyAndSettle(evidence: PaymentEvidence, contentHash: string): Promise<PaymentAttempt & { __legacyFeeData?: any }> {
    const paymentIdentifier = evidence.method === 'x402_usdc' ? evidence.paymentIdentifier : null;
    const txHash = evidence.method === 'legacy_eth' ? evidence.txHash : null;

    // Create payment_attempt
    const [attempt] = await db.insert(paymentAttempts).values({
      contentHash,
      method: evidence.method,
      status: 'pending',
      paymentIdentifier,
      txHash,
    }).returning();

    try {
      if (evidence.method === 'legacy_eth') {
        const result = await verifyFee(evidence.txHash);
        
        // Update payment_attempt to settled
        const [updatedAttempt] = await db.update(paymentAttempts)
          .set({ 
            status: 'settled',
            amountAtomic: result.amount, 
            currency: 'ETH',
            updatedAt: new Date(),
          })
          .where(eq(paymentAttempts.id, attempt.id))
          .returning();
          
        return { 
          ...updatedAttempt, 
          __legacyFeeData: { 
            feeBlock: Number(result.blockNumber), 
            feeConfirmedAt: result.confirmedAt 
          } 
        };
      } else if (evidence.method === 'x402_usdc') {
        const { x402Verifier } = await import('./x402Verifier.js');
        const result = await x402Verifier.verifyAndSettle(evidence.paymentSignature);
        
        // Update payment_attempt to settled
        const [updatedAttempt] = await db.update(paymentAttempts)
          .set({ 
            status: 'settled',
            amountAtomic: result.amount, 
            currency: 'USDC', // As per our x402 setup
            receipt: {
               transaction: result.transaction,
               network: result.network,
               payer: result.payer,
            },
            updatedAt: new Date(),
          })
          .where(eq(paymentAttempts.id, attempt.id))
          .returning();
          
        return updatedAttempt;
      }
      
      throw new Error('Unknown payment method');
    } catch (error: any) {
      // Update to failed
      await db.update(paymentAttempts)
        .set({
          status: 'failed',
          error: error instanceof ApiError ? error.message : String(error),
          updatedAt: new Date(),
        })
        .where(eq(paymentAttempts.id, attempt.id));
        
      throw error;
    }
  }

  async linkRecord(attemptId: string, recordId: string) {
    await db.update(paymentAttempts)
      .set({ recordId, updatedAt: new Date() })
      .where(eq(paymentAttempts.id, attemptId));
  }
}

export const paymentVerifier = new PaymentVerifier();
