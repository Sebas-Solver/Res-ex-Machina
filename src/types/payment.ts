// SPDX-License-Identifier: Apache-2.0
export type PaymentMethod = 'legacy_eth' | 'x402_usdc';

export interface BasePaymentEvidence {
  method: PaymentMethod;
  amountAtomic?: string;
  decimals?: number;
  currency?: string;
  txHash?: string;
}

export interface LegacyEthEvidence extends BasePaymentEvidence {
  method: 'legacy_eth';
  txHash: string; // Obligatorio en legacy
}

export interface X402Evidence extends BasePaymentEvidence {
  method: 'x402_usdc';
  paymentSignature: string;
  paymentIdentifier: string; // Obligatorio
}

export type PaymentEvidence = LegacyEthEvidence | X402Evidence;
