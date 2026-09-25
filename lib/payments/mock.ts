import { randomUUID } from 'node:crypto';
import type { PaymentProvider } from '@/lib/payments/types';

/**
 * Development stand-in for a gateway.
 *
 * Reports every order as paid, so the unlock → payment → lead path can be
 * exercised without Razorpay keys. That makes paid contacts free, which is
 * why it refuses to load in production — a misconfigured `PAYMENT_PROVIDER`
 * on a live deployment would otherwise give away the entire business model
 * silently.
 */
export function createMockProvider(): PaymentProvider {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'PAYMENT_PROVIDER=mock is not usable in production — it treats every order as paid. ' +
        'Set PAYMENT_PROVIDER=razorpay with real keys.',
    );
  }

  return {
    name: 'mock',
    publicKey: null,

    async createOrder({ amount, currency }) {
      return { providerOrderId: `mock_order_${randomUUID()}`, amount, currency };
    },

    async fetchStatus(providerOrderId) {
      return {
        paid: true,
        providerPaymentId: `mock_pay_${providerOrderId.slice(-12)}`,
        amountPaid: null, // skips the amount reconciliation check
        statusLabel: 'captured (mock)',
      };
    },

    verifyWebhookSignature() {
      return true;
    },

    parseWebhook(rawBody) {
      const body = JSON.parse(rawBody) as { order_id?: string; payment_id?: string; amount?: number };
      return {
        paid: true,
        event: 'mock.paid',
        providerOrderId: body.order_id ?? null,
        providerPaymentId: body.payment_id ?? null,
        amount: body.amount ?? null,
      };
    },
  };
}
