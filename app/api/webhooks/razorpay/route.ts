import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPaymentProvider } from '@/lib/payments';

/**
 * §7 — gateway webhook. The only push path that can settle a paid unlock.
 *
 * Why this exists when the return-from-checkout path already verifies: that
 * path only runs if the buyer comes back. Someone who pays in GPay and then
 * closes the tab would otherwise be charged with the contact still locked.
 *
 * Three things make it safe:
 *
 *   - the raw body is read as text and the HMAC checked before anything is
 *     parsed or trusted
 *   - the amount is reconciled against the payment row we created
 *   - settlement goes through settle_paid_contact_unlock(), which is
 *     idempotent, so gateway retries and the return path cannot double-grant
 *
 * Excluded from the auth middleware: this request carries a signature, not a
 * session cookie.
 */

// Signature verification needs the exact bytes sent, so this must never be
// statically optimised or cached.
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  // A misconfigured gateway must surface as a clear 503, not an opaque 500.
  // 503 also tells the gateway to retry, so events queued during a bad deploy
  // are not lost once the configuration is fixed.
  let provider;
  try {
    provider = getPaymentProvider();
  } catch (cause) {
    console.error('[webhook] payment provider unavailable:', cause);
    return NextResponse.json({ error: 'payment provider not configured' }, { status: 503 });
  }

  // Read as text. Parsing to JSON and re-serialising changes the bytes and
  // the HMAC will never match.
  const rawBody = await request.text();
  const signature = request.headers.get('x-razorpay-signature');

  if (!provider.verifyWebhookSignature(rawBody, signature)) {
    // Deliberately terse: an attacker probing the endpoint learns nothing.
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  let event;
  try {
    event = provider.parseWebhook(rawBody);
  } catch {
    return NextResponse.json({ error: 'malformed payload' }, { status: 400 });
  }

  // Acknowledge everything we understand. Returning non-2xx for an event we
  // simply do not act on would make the gateway retry it forever.
  if (!event.paid || !event.providerOrderId) {
    return NextResponse.json({ received: true, handled: false, event: event.event });
  }

  const admin = createAdminClient();

  const { data: payment } = await admin
    .from('payments')
    .select('id, amount, status')
    .eq('provider', provider.name)
    .eq('provider_order_id', event.providerOrderId)
    .maybeSingle();

  if (!payment) {
    // Not one of ours — acknowledge so it is not retried indefinitely.
    return NextResponse.json({ received: true, handled: false, reason: 'unknown order' });
  }

  if (payment.status === 'success') {
    return NextResponse.json({ received: true, handled: true, reason: 'already settled' });
  }

  // Never settle for less than the order was created for.
  if (event.amount !== null && event.amount < Number(payment.amount)) {
    await admin.rpc('fail_payment', {
      p_payment_id: payment.id,
      p_reason: `Underpaid: expected ${payment.amount}, received ${event.amount}`,
      p_metadata: { source: 'webhook', event: event.event },
    });
    return NextResponse.json({ received: true, handled: false, reason: 'amount mismatch' });
  }

  const { data, error } = await admin.rpc('settle_paid_contact_unlock', {
    p_payment_id: payment.id,
    p_provider_payment_id: event.providerPaymentId ?? '',
    p_metadata: { source: 'webhook', event: event.event },
  });

  if (error) {
    // 500 asks the gateway to retry, which is what we want for a transient
    // database problem.
    return NextResponse.json({ error: 'settlement failed' }, { status: 500 });
  }

  const outcome = (data ?? {}) as { ok?: boolean; code?: string };
  return NextResponse.json({ received: true, handled: Boolean(outcome.ok), code: outcome.code });
}

/**
 * Razorpay pings the URL when you save it in the dashboard.
 *
 * Reports whether the secret is actually configured, because a webhook saved
 * against an endpoint with no secret silently rejects every event.
 */
export async function GET() {
  let configured = false;
  try {
    configured = Boolean(getPaymentProvider());
  } catch {
    configured = false;
  }
  return NextResponse.json({ ok: true, endpoint: 'razorpay webhook', configured });
}
