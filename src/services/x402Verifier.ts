import { HTTPFacilitatorClient } from '@x402/core/http';
import type { PaymentPayload, PaymentRequirements, SettleResponse } from '@x402/core/types';
import { env } from '../config/env.js';
import { ApiError } from '../utils/errors.js';

export class X402Verifier {
  private facilitatorClient: HTTPFacilitatorClient;

  constructor() {
    this.facilitatorClient = new HTTPFacilitatorClient({
      url: env.X402_FACILITATOR_URL,
    });
  }

  public getPaymentRequirements(): PaymentRequirements[] {
    // PaymentRequirements does NOT include x402Version (that belongs in PaymentRequired).
    // The x402Version is added by the server when building the 402 response wrapper.
    return [
      {
        scheme: 'evm',
        network: `eip155:${env.L2_CHAIN_ID}` as const,
        asset: env.X402_USDC_ADDRESS,
        amount: env.FEE_MINIMUM_AMOUNT.toString(),
        payTo: env.FEE_RECEIVER_ADDRESS,
        maxTimeoutSeconds: 3600,
        extra: {},
      },
    ];
  }

  public async verifyAndSettle(paymentSignature: string): Promise<SettleResponse> {
    let payload: PaymentPayload;
    try {
      // paymentSignature is expected to be base64-encoded JSON representing the PaymentPayload
      payload = JSON.parse(Buffer.from(paymentSignature, 'base64').toString('utf8')) as PaymentPayload;
    } catch {
      throw new ApiError(400, 'invalid_payment_signature', 'Invalid PAYMENT-SIGNATURE format');
    }

    const reqs = this.getPaymentRequirements();

    // Pick the first matching requirement (only one scheme supported for now)
    const req = reqs[0];

    // 1. Verify — VerifyResponse uses `isValid` and `invalidReason`/`invalidMessage`
    const verifyResult = await this.facilitatorClient.verify(payload, req);
    if (!verifyResult.isValid) {
      throw new ApiError(
        402,
        'x402_verification_failed',
        `Payment verification failed: ${verifyResult.invalidReason ?? 'unknown'} - ${verifyResult.invalidMessage ?? ''}`,
      );
    }

    // 2. Settle — SettleResponse uses `success` and `errorReason`/`errorMessage`
    const settleResult = await this.facilitatorClient.settle(payload, req);
    if (!settleResult.success) {
      throw new ApiError(
        402,
        'x402_settlement_failed',
        `Payment settlement failed: ${settleResult.errorReason ?? 'unknown'} - ${settleResult.errorMessage ?? ''}`,
      );
    }

    return settleResult;
  }
}

export const x402Verifier = new X402Verifier();
