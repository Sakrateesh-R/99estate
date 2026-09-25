import { getServerEnv } from '@/lib/env';
import { createMockProvider } from '@/lib/payments/mock';
import { createRazorpayProvider } from '@/lib/payments/razorpay';
import type { PaymentProvider } from '@/lib/payments/types';

export type { PaymentProvider, PaymentStatus, WebhookEvent } from '@/lib/payments/types';
export { PaymentProviderError } from '@/lib/payments/types';

let cached: PaymentProvider | null = null;

/**
 * §7 — the gateway is chosen by environment, so swapping providers is a
 * deployment change rather than a code change.
 */
export function getPaymentProvider(): PaymentProvider {
  if (cached) return cached;

  const env = getServerEnv();

  if (env.PAYMENT_PROVIDER === 'razorpay') {
    if (!env.PAYMENT_PROVIDER_KEY || !env.PAYMENT_PROVIDER_SECRET) {
      throw new Error(
        'PAYMENT_PROVIDER=razorpay requires PAYMENT_PROVIDER_KEY (key_id) and ' +
          'PAYMENT_PROVIDER_SECRET (key_secret) in the environment.',
      );
    }

    cached = createRazorpayProvider({
      keyId: env.PAYMENT_PROVIDER_KEY,
      keySecret: env.PAYMENT_PROVIDER_SECRET,
      webhookSecret: env.PAYMENT_WEBHOOK_SECRET ?? null,
    });
    return cached;
  }

  cached = createMockProvider();
  return cached;
}
