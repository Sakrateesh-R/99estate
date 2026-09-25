/**
 * Razorpay Checkout loader.
 *
 * The script is fetched on first use rather than on every page, because the
 * overwhelming majority of sessions never reach a paid unlock — most buyers
 * are inside their two free contacts for the day.
 *
 * What the browser is trusted with: opening the gateway dialog. What it is
 * not trusted with: deciding the outcome. `handler` and `ondismiss` both
 * resolve to "go ask the server", never "payment succeeded".
 */

const SCRIPT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

type RazorpayResponse = {
  razorpay_payment_id?: string;
  razorpay_order_id?: string;
  razorpay_signature?: string;
};

type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  name: string;
  description?: string;
  image?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  notes?: Record<string, string>;
  theme?: { color?: string };
  handler?: (response: RazorpayResponse) => void;
  modal?: { ondismiss?: () => void; confirm_close?: boolean };
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => { open: () => void; close: () => void };
  }
}

let loader: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Not in a browser'));
  if (window.Razorpay) return Promise.resolve();
  if (loader) return loader;

  loader = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Could not load Razorpay')));
      return;
    }

    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loader = null; // allow a retry on the next attempt
      reject(new Error('Could not load the payment gateway. Check your connection.'));
    };
    document.head.appendChild(script);
  });

  return loader;
}

export type CheckoutOutcome = 'completed' | 'dismissed';

/**
 * Opens the gateway dialog and resolves once it closes.
 *
 * `completed` means the dialog reported success — NOT that the payment is
 * verified. The caller must still ask the server. `dismissed` means the buyer
 * closed it, which is also worth re-checking: UPI can settle after the dialog
 * is gone.
 */
export async function openRazorpayCheckout(options: {
  keyId: string;
  orderId: string;
  amountInRupees: number;
  currency: string;
  description: string;
  prefill: { name?: string | null; email?: string | null; contact?: string | null };
}): Promise<CheckoutOutcome> {
  await loadScript();

  const Razorpay = window.Razorpay;
  if (!Razorpay) throw new Error('Payment gateway is unavailable.');

  return new Promise<CheckoutOutcome>((resolve) => {
    let settled = false;
    const finish = (outcome: CheckoutOutcome) => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };

    const instance = new Razorpay({
      key: options.keyId,
      // Razorpay works in paise.
      amount: Math.round(options.amountInRupees * 100),
      currency: options.currency,
      order_id: options.orderId,
      name: '99Estate',
      description: options.description,
      prefill: {
        name: options.prefill.name ?? undefined,
        email: options.prefill.email ?? undefined,
        // Checkout expects a bare 10-digit number for Indian mobiles.
        contact: options.prefill.contact ?? undefined,
      },
      theme: { color: '#0c6852' },
      handler: () => finish('completed'),
      modal: { ondismiss: () => finish('dismissed'), confirm_close: true },
    });

    instance.open();
  });
}
