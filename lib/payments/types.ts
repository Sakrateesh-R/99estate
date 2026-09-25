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

export type CredentialCheck = {
  /** The gateway accepted our key pair on a live call. */
  valid: boolean;
  /**
   * Which set of books the key belongs to — `test` money is not real money.
   * Worth surfacing: a live deployment left on test keys takes no payment,
   * and test keys against a live webhook secret reject every event.
   */
  mode: 'test' | 'live' | 'mock' | 'unknown';
  /** Gateway's own wording when the key was refused. */
  reason?: string;
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
   * Asks the gateway whether our credentials still work.
   *
   * Holding a key is not the same as holding a working key: a rotated or
   * expired one stays in the environment looking perfectly configured, and
   * the first symptom is a buyer staring at a checkout dialog that refuses
   * every request. This turns that into something checkable before anyone
   * tries to pay.
   */
  checkCredentials(): Promise<CredentialCheck>;

  /**
   * Validates the signed payload Checkout hands back on success.
   *
   * Razorpay signs `order_id|payment_id` with the key secret. Verifying it
   * proves the response genuinely came from Razorpay and was not forged or
   * replayed by the browser, and costs nothing — no network call.
   *
   * It is a gate, not the final word: a valid signature proves authenticity,
   * not that the money was captured. `fetchStatus` still decides.
   */
  verifyCheckoutSignature(input: {
    providerOrderId: string;
    providerPaymentId: string;
    signature: string;
  }): boolean;

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
