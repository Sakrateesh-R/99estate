import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  PaymentProviderError,
  type CreatedOrder,
  type PaymentProvider,
  type PaymentStatus,
  type WebhookEvent,
} from '@/lib/payments/types';

/**
 * Razorpay adapter, over the REST API rather than the SDK.
 *
 * The SDK is a thin wrapper around three endpoints; skipping it keeps the
 * dependency tree small and means nothing here needs a native build.
 *
 * Razorpay Checkout gives the UPI experience for free — a QR on desktop and
 * an intent hand-off to GPay/PhonePe/Paytm on mobile — while still producing
 * a verifiable order, which a raw `upi://` link cannot.
 */

const API = 'https://api.razorpay.com/v1';

/** Razorpay works in paise. Every boundary in this file converts. */
const toPaise = (rupees: number) => Math.round(rupees * 100);
const toRupees = (paise: number) => paise / 100;

/** Razorpay's documented floor for an order. */
const MINIMUM_PAISE = 100;

export function createRazorpayProvider(config: {
  keyId: string;
  keySecret: string;
  webhookSecret: string | null;
}): PaymentProvider {
  const authHeader = `Basic ${Buffer.from(`${config.keyId}:${config.keySecret}`).toString('base64')}`;

  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
        ...init?.headers,
      },
      // Payment calls must never be served from a cache.
      cache: 'no-store',
    });

    const body = (await response.json().catch(() => null)) as
      | (T & { error?: { description?: string } })
      | null;

    if (!response.ok) {
      throw new PaymentProviderError(
        body?.error?.description ?? `Razorpay request failed (${response.status})`,
        response.status,
      );
    }
    if (!body) throw new PaymentProviderError('Razorpay returned an empty response');

    return body;
  }

  return {
    name: 'razorpay',
    // `key_id` is public by design — Checkout runs with it in the browser.
    publicKey: config.keyId,

    async createOrder({ amount, currency, receipt, notes }) {
      // Razorpay rejects anything below 100 paise. Failing here gives a clear
      // message instead of an opaque gateway error, and catches a bad
      // `contact_unlock_price` in app_settings before money is involved.
      if (toPaise(amount) < MINIMUM_PAISE) {
        throw new PaymentProviderError(
          `Razorpay requires at least ₹${MINIMUM_PAISE / 100}. The configured price is ₹${amount}.`,
        );
      }

      const order = await call<{ id: string; amount: number; currency: string }>('/orders', {
        method: 'POST',
        body: JSON.stringify({
          amount: toPaise(amount),
          currency,
          // Our payment-row id, so a gateway record can always be traced back.
          receipt: receipt.slice(0, 40),
          notes,
          // Capture automatically: an authorised-but-uncaptured payment would
          // leave the buyer charged with the contact still locked.
          payment_capture: 1,
        }),
      });

      return {
        providerOrderId: order.id,
        amount: toRupees(order.amount),
        currency: order.currency,
      } satisfies CreatedOrder;
    },

    async fetchStatus(providerOrderId) {
      const result = await call<{
        count: number;
        items: { id: string; status: string; amount: number }[];
      }>(`/orders/${encodeURIComponent(providerOrderId)}/payments`);

      // An order can carry several attempts; only a captured one is money.
      const captured = result.items?.find((p) => p.status === 'captured');
      const latest = captured ?? result.items?.[result.items.length - 1];

      return {
        paid: Boolean(captured),
        providerPaymentId: latest?.id ?? null,
        amountPaid: latest ? toRupees(latest.amount) : null,
        statusLabel: latest?.status ?? 'none',
      } satisfies PaymentStatus;
    },

    verifyCheckoutSignature({ providerOrderId, providerPaymentId, signature }) {
      if (!providerOrderId || !providerPaymentId || !signature) return false;

      // Razorpay's documented scheme: HMAC-SHA256 of "order_id|payment_id",
      // keyed with the API secret, hex encoded.
      const expected = createHmac('sha256', config.keySecret)
        .update(`${providerOrderId}|${providerPaymentId}`)
        .digest();

      let received: Buffer;
      try {
        received = Buffer.from(signature, 'hex');
      } catch {
        return false;
      }

      if (expected.length !== received.length) return false;
      return timingSafeEqual(expected, received);
    },

    verifyWebhookSignature(rawBody, signature) {
      if (!config.webhookSecret || !signature) return false;

      const expected = createHmac('sha256', config.webhookSecret).update(rawBody).digest();
      let received: Buffer;
      try {
        received = Buffer.from(signature, 'hex');
      } catch {
        return false;
      }

      // Length must match before timingSafeEqual, which throws otherwise.
      if (expected.length !== received.length) return false;
      return timingSafeEqual(expected, received);
    },

    parseWebhook(rawBody) {
      const payload = JSON.parse(rawBody) as {
        event?: string;
        payload?: {
          payment?: { entity?: { id?: string; order_id?: string; amount?: number; status?: string } };
          order?: { entity?: { id?: string; amount?: number } };
        };
      };

      const payment = payload.payload?.payment?.entity;
      const order = payload.payload?.order?.entity;
      const event = payload.event ?? 'unknown';

      return {
        // `payment.captured` and `order.paid` are the only settled states.
        // `payment.authorized` is not: the money is held, not taken.
        paid: event === 'payment.captured' || event === 'order.paid',
        event,
        providerOrderId: payment?.order_id ?? order?.id ?? null,
        providerPaymentId: payment?.id ?? null,
        amount:
          typeof payment?.amount === 'number'
            ? toRupees(payment.amount)
            : typeof order?.amount === 'number'
              ? toRupees(order.amount)
              : null,
      } satisfies WebhookEvent;
    },
  };
}
