/**
 * §7 — the payment provider contract.
 *
 * Everything above this file talks in rupees and in our own payment-row ids.
 * Only the adapters know about paise, Basic auth or provider-specific event
 * shapes, so swapping gateway is a change to one directory.
 *
 * Two verification paths are required of every provider, and the reason is
 * operational rather than architectural:
 *
 *   fetchStatus  the buyer came back — ask the gateway whether they actually
 *                paid. Works on localhost with no public URL.
 *   webhook      the buyer closed the tab mid-payment. Without this the money
 *                is taken and the contact never unlocks.
 *
 * Neither path trusts the browser: the client can only ask the server to
 * re-check, never assert an outcome.
 */

export type CreatedOrder = {
  providerOrderId: string;
  /** Rupees, echoed back by the provider — compared against what we asked for. */
  amount: number;
  currency: string;
};

export type PaymentStatus = {
  paid: boolean;
  providerPaymentId: string | null;
  /** Rupees actually paid. Must be reconciled against the expected amount. */
  amountPaid: number | null;
  /** Provider status string, kept for the audit trail. */
  statusLabel: string;
};

export type WebhookEvent = {
  /** True only for events that mean "money has settled". */
  paid: boolean;
  event: string;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  /** Rupees. */
  amount: number | null;
};

export interface PaymentProvider {
  readonly name: string;

  /**
   * Key the browser is allowed to see (Razorpay's `key_id` is public by
   * design). Null for providers with no such concept.
   */
  readonly publicKey: string | null;

  createOrder(input: {
    amount: number;
    currency: string;
    receipt: string;
    notes?: Record<string, string>;
  }): Promise<CreatedOrder>;

  fetchStatus(providerOrderId: string): Promise<PaymentStatus>;

  /**
   * Must be computed over the RAW request body. Re-serialising parsed JSON
   * changes the bytes and the signature will never match.
   */
  verifyWebhookSignature(rawBody: string, signature: string | null): boolean;

  parseWebhook(rawBody: string): WebhookEvent;
}

export class PaymentProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'PaymentProviderError';
  }
}
