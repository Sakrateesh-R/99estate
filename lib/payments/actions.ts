'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUser } from '@/lib/auth/session';
import { getPaymentProvider, PaymentProviderError } from '@/lib/payments';
import { getSiteUrl } from '@/lib/env';
import type { Enums } from '@/types/database.types';

/**
 * §7 — the paid half of the contact unlock.
 *
 * Three rules shape every function here:
 *
 *   1. the amount is read from the database, never from the request
 *   2. the client may ask the server to re-check a payment, never assert one
 *   3. settlement happens exactly once, through settle_paid_contact_unlock(),
 *      which is idempotent — so the return-from-checkout path and the webhook
 *      can both fire safely and whichever lands first wins
 */

export type CreateOrderResult =
  | {
      status: 'order_created';
      paymentId: string;
      providerOrderId: string;
      /** Rupees, decided server-side. */
      amount: number;
      currency: string;
      publicKey: string | null;
      provider: string;
      propertyTitle: string;
      buyerName: string | null;
      buyerEmail: string;
      buyerMobile: string | null;
      callbackUrl: string;
    }
  | { status: 'free_available' }
  | { status: 'already_unlocked' }
  | { status: 'sign_in_required' }
  | { status: 'profile_incomplete' }
  | { status: 'own_listing' }
  | { status: 'unavailable' }
  | { status: 'error'; message: string };

/**
 * Opens a gateway order for one contact unlock.
 *
 * `create_contact_unlock_order` is what actually decides: it re-checks
 * authentication, profile completeness, listing availability, whether this
 * buyer already owns the unlock, and whether a free one is still available —
 * then stamps the price from `app_settings`. This action never sees an amount
 * from the browser.
 */
export async function createUnlockOrder(propertyId: string): Promise<CreateOrderResult> {
  const user = await getUser();
  if (!user) return { status: 'sign_in_required' };

  const supabase = await createClient();
  const provider = getPaymentProvider();

  const { data, error } = await supabase.rpc('create_contact_unlock_order', {
    p_property_id: propertyId,
    p_provider: provider.name,
  });

  if (error) return { status: 'error', message: error.message };

  const result = (data ?? {}) as {
    ok?: boolean;
    code?: string;
    payment_id?: string;
    amount?: number;
    currency?: string;
    provider_order_id?: string | null;
  };

  switch (result.code) {
    case 'free_available':
      return { status: 'free_available' };
    case 'already_unlocked':
      return { status: 'already_unlocked' };
    case 'profile_incomplete':
      return { status: 'profile_incomplete' };
    case 'own_listing':
      return { status: 'own_listing' };
    case 'unauthenticated':
      return { status: 'sign_in_required' };
    case 'not_found':
    case 'unavailable':
      return { status: 'unavailable' };
    case 'order_created':
      break;
    default:
      return { status: 'error', message: 'Could not start the payment. Please try again.' };
  }

  if (!result.payment_id || typeof result.amount !== 'number') {
    return { status: 'error', message: 'Could not start the payment. Please try again.' };
  }

  const amount = result.amount;
  const currency = result.currency ?? 'INR';

  // Buyer details prefill the checkout form. They are read here rather than
  // accepted from the client so the gateway record matches the real account.
  const [{ data: profile }, { data: property }] = await Promise.all([
    supabase.from('profiles').select('full_name, email, mobile_number').eq('id', user.id).maybeSingle(),
    supabase.from('properties').select('title').eq('id', propertyId).maybeSingle(),
  ]);

  try {
    // Reuse the gateway order if this payment row already has one — reopening
    // the dialog should not litter the gateway with abandoned orders.
    let providerOrderId = result.provider_order_id ?? null;

    if (!providerOrderId) {
      const order = await provider.createOrder({
        amount,
        currency,
        receipt: result.payment_id,
        notes: {
          payment_id: result.payment_id,
          property_id: propertyId,
          buyer_id: user.id,
          purpose: 'contact_unlock',
        },
      });

      if (order.amount !== amount) {
        return {
          status: 'error',
          message: 'The gateway returned a different amount. Payment cancelled.',
        };
      }

      providerOrderId = order.providerOrderId;

      // Service role: attach_payment_order is closed to clients so a browser
      // cannot point our payment row at an order it controls.
      const admin = createAdminClient();
      const { error: attachError } = await admin.rpc('attach_payment_order', {
        p_payment_id: result.payment_id,
        p_provider_order_id: providerOrderId,
        p_metadata: { provider: provider.name },
      });
      if (attachError) return { status: 'error', message: attachError.message };
    }

    return {
      status: 'order_created',
      paymentId: result.payment_id,
      providerOrderId,
      amount,
      currency,
      publicKey: provider.publicKey,
      provider: provider.name,
      propertyTitle: property?.title ?? 'Property',
      buyerName: profile?.full_name ?? null,
      buyerEmail: profile?.email ?? '',
      buyerMobile: profile?.mobile_number ?? null,
      callbackUrl: `${getSiteUrl()}/api/webhooks/${provider.name}`,
    };
  } catch (cause) {
    const message =
      cause instanceof PaymentProviderError
        ? cause.message
        : 'Could not reach the payment gateway. Please try again.';
    return { status: 'error', message };
  }
}

export type VerifyResult =
  | {
      status: 'unlocked';
      seller: { name: string | null; mobile: string; sellerType: Enums<'user_role'> };
    }
  | { status: 'pending'; message: string }
  | { status: 'failed'; message: string }
  | { status: 'error'; message: string };

/**
 * The "pull" verification path: the buyer came back from checkout, so ask the
 * gateway what really happened.
 *
 * The client passes only our payment-row id. It cannot tell us the payment
 * succeeded, how much was paid, or which gateway payment to trust — all three
 * come from the gateway over an authenticated server-side call.
 *
 * Works without a public URL, which is what makes local development possible;
 * the webhook covers the case where the buyer never returns.
 */
export async function verifyUnlockPayment(
  paymentId: string,
  /**
   * The signed payload Checkout returns on success. Optional because the
   * buyer may never see it — they can close the tab, or land here from the
   * dismissed branch after a late UPI settlement.
   */
  checkout?: { providerOrderId: string; providerPaymentId: string; signature: string },
): Promise<VerifyResult> {
  const user = await getUser();
  if (!user) return { status: 'error', message: 'Your session expired. Please sign in again.' };

  const supabase = await createClient();

  // RLS restricts this to the caller's own payments.
  const { data: payment } = await supabase
    .from('payments')
    .select('id, user_id, property_id, amount, currency, status, provider_order_id, contact_unlock_id')
    .eq('id', paymentId)
    .maybeSingle();

  if (!payment) return { status: 'error', message: 'That payment could not be found.' };

  // Already settled — by an earlier check or by the webhook.
  if (payment.status === 'success') return revealContact(payment.property_id);

  if (!payment.provider_order_id) {
    return { status: 'pending', message: 'The payment has not started yet.' };
  }

  const provider = getPaymentProvider();

  /**
   * Gate one: if Checkout handed back a signed payload, it must verify.
   *
   * Cheap (no network call) and it catches a forged or replayed response
   * before we spend an API round trip on it. Two extra checks matter here:
   * the order in the payload must be the order we created for this payment
   * row, or a valid signature from some *other* order could be replayed
   * against this one.
   */
  if (checkout?.signature) {
    if (checkout.providerOrderId !== payment.provider_order_id) {
      return {
        status: 'failed',
        message: 'That payment belongs to a different order. Nothing was unlocked.',
      };
    }

    const authentic = provider.verifyCheckoutSignature({
      providerOrderId: checkout.providerOrderId,
      providerPaymentId: checkout.providerPaymentId,
      signature: checkout.signature,
    });

    if (!authentic) {
      return {
        status: 'failed',
        message: 'We could not verify that payment. Nothing was charged or unlocked.',
      };
    }
  }

  // Gate two: the gateway decides whether money actually moved. A valid
  // signature proves authenticity, not capture.
  let statusResult;
  try {
    statusResult = await provider.fetchStatus(payment.provider_order_id);
  } catch (cause) {
    const message =
      cause instanceof PaymentProviderError
        ? cause.message
        : 'Could not reach the payment gateway.';
    return { status: 'error', message };
  }

  if (!statusResult.paid) {
    return {
      status: 'pending',
      message:
        statusResult.statusLabel === 'none'
          ? 'We have not seen the payment yet. If you have paid, give it a moment.'
          : `Payment is ${statusResult.statusLabel}. If money left your account, it will unlock shortly.`,
    };
  }

  // Never settle for less than we asked. A provider that cannot report an
  // amount (the dev mock) is allowed through only because it is dev-only.
  if (statusResult.amountPaid !== null && statusResult.amountPaid < Number(payment.amount)) {
    return {
      status: 'failed',
      message: 'The amount paid does not match the order. Our team will review it.',
    };
  }

  const admin = createAdminClient();
  const { data: settled, error: settleError } = await admin.rpc('settle_paid_contact_unlock', {
    p_payment_id: payment.id,
    p_provider_payment_id: statusResult.providerPaymentId ?? '',
    p_metadata: { source: 'return_from_checkout', status: statusResult.statusLabel },
  });

  if (settleError) return { status: 'error', message: settleError.message };

  const outcome = (settled ?? {}) as { ok?: boolean; code?: string };
  if (!outcome.ok) {
    return { status: 'error', message: 'Payment received but the unlock failed. Contact support.' };
  }

  revalidatePath('/', 'layout');
  return revealContact(payment.property_id);
}

/** Reads back the now-unlocked contact through the curated view. */
async function revealContact(propertyId: string | null): Promise<VerifyResult> {
  if (!propertyId) return { status: 'error', message: 'This payment has no property attached.' };

  const supabase = await createClient();
  const { data } = await supabase
    .from('unlocked_seller_contacts')
    .select('seller_name, seller_mobile, seller_type')
    .eq('property_id', propertyId)
    .maybeSingle();

  if (!data?.seller_mobile) {
    return { status: 'error', message: 'Payment settled but the contact could not be read.' };
  }

  return {
    status: 'unlocked',
    seller: {
      name: data.seller_name,
      mobile: data.seller_mobile,
      sellerType: data.seller_type ?? 'owner',
    },
  };
}
