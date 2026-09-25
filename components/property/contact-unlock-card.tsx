'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  BadgeCheck,
  CheckCircle2,
  Lock,
  MessageCircle,
  Phone,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { cn, propertyPath } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { formatMobile, telHref, whatsappHref, formatQuotaReset } from '@/lib/format';
import { SELLER_TYPE_LABELS } from '@/lib/constants';
import { unlockContact, type ContactState } from '@/lib/contacts/actions';
import { createUnlockOrder, verifyUnlockPayment } from '@/lib/payments/actions';
import { openRazorpayCheckout } from '@/lib/payments/checkout';
import { rememberReturnTo } from '@/lib/auth/return-to-actions';
import type { Enums } from '@/types/database.types';

type Seller = { name: string | null; mobile: string; sellerType: Enums<'user_role'> };

/**
 * §10 — the contact section, and the single most important CTA on the site.
 *
 * Every label here is derived from server state. The component never decides
 * whether an unlock is free; it renders what `get_contact_unlock_state()` says
 * and then re-renders whatever `request_contact_unlock()` returns.
 */
export function ContactUnlockCard({
  propertyId,
  propertySlug,
  propertyTitle,
  state,
  sellerName,
  sellerType,
  className,
}: {
  propertyId: string;
  propertySlug: string | null;
  propertyTitle: string;
  state: ContactState;
  sellerName: string | null;
  sellerType: Enums<'user_role'>;
  className?: string;
}) {
  const router = useRouter();
  const toast = useToast();

  const [seller, setSeller] = React.useState<Seller | null>(state.seller);
  const [freeRemaining, setFreeRemaining] = React.useState<number | null>(state.freeRemaining);
  const [busy, setBusy] = React.useState(false);
  const [payingLabel, setPayingLabel] = React.useState<string | null>(null);

  const nextPath = propertyPath({ id: propertyId, slug: propertySlug });

  /**
   * Records where to come back to in an httpOnly cookie, then navigates to a
   * clean URL — no `?next=` in the address bar.
   */
  async function goToAuth(target: '/login' | '/complete-profile') {
    await rememberReturnTo(nextPath);
    router.push(target);
  }

  /**
   * §7 — the paid path.
   *
   * The browser's only jobs are opening the gateway dialog and then asking the
   * server to re-check. It never reports the outcome: `verifyUnlockPayment`
   * queries Razorpay server-side and settles through the idempotent RPC.
   *
   * The dismissed branch matters as much as the completed one — UPI can settle
   * after the dialog is closed, so we re-check either way.
   */
  async function startPayment() {
    setPayingLabel('Starting payment…');

    const order = await createUnlockOrder(propertyId);

    switch (order.status) {
      case 'free_available':
        // A free unlock became available between the two calls.
        setPayingLabel(null);
        return handleUnlock();
      case 'already_unlocked':
        setPayingLabel(null);
        router.refresh();
        return;
      case 'sign_in_required':
        setPayingLabel(null);
        return goToAuth('/login');
      case 'profile_incomplete':
        setPayingLabel(null);
        return goToAuth('/complete-profile');
      case 'own_listing':
      case 'unavailable':
        setPayingLabel(null);
        toast({ tone: 'warning', title: 'This listing cannot be unlocked' });
        return;
      case 'error':
        setPayingLabel(null);
        toast({ tone: 'error', title: 'Payment could not start', description: order.message });
        return;
      case 'order_created':
        break;
    }

    try {
      // The dev mock has no public key and no dialog — go straight to
      // verification so the flow is testable without gateway credentials.
      if (order.publicKey) {
        setPayingLabel('Waiting for payment…');
        await openRazorpayCheckout({
          keyId: order.publicKey,
          orderId: order.providerOrderId,
          amountInRupees: order.amount,
          currency: order.currency,
          description: `Contact unlock · ${order.propertyTitle}`.slice(0, 250),
          prefill: {
            name: order.buyerName,
            email: order.buyerEmail,
            contact: order.buyerMobile,
          },
        });
      }

      setPayingLabel('Confirming payment…');
      const verified = await verifyUnlockPayment(order.paymentId);

      switch (verified.status) {
        case 'unlocked':
          setSeller(verified.seller);
          toast({ tone: 'success', title: 'Payment confirmed', description: 'Contact unlocked.' });
          router.refresh();
          break;
        case 'pending':
          toast({ tone: 'info', title: 'Payment not confirmed yet', description: verified.message });
          break;
        case 'failed':
          toast({ tone: 'error', title: 'Payment problem', description: verified.message });
          break;
        default:
          toast({ tone: 'error', title: 'Could not confirm payment', description: verified.message });
      }
    } catch (cause) {
      toast({
        tone: 'error',
        title: 'Payment could not be completed',
        description: cause instanceof Error ? cause.message : undefined,
      });
    } finally {
      setPayingLabel(null);
    }
  }

  async function handleUnlock() {
    setBusy(true);
    try {
      const result = await unlockContact(propertyId);

      switch (result.status) {
        case 'unlocked':
          setSeller(result.seller);
          setFreeRemaining(result.freeRemaining);
          toast({
            tone: 'success',
            title: 'Contact unlocked',
            description: result.wasFree
              ? `Used a free contact.${result.freeRemaining !== null ? ` ${result.freeRemaining} left today.` : ''}`
              : 'Payment confirmed.',
          });
          router.refresh();
          break;

        case 'payment_required':
          await startPayment();
          break;

        case 'sign_in_required':
          await goToAuth('/login');
          break;

        case 'profile_incomplete':
          await goToAuth('/complete-profile');
          break;

        case 'own_listing':
          toast({ tone: 'info', title: 'This is your own listing' });
          break;

        case 'unavailable':
          toast({ tone: 'warning', title: 'This listing is no longer available' });
          router.refresh();
          break;

        default:
          toast({ tone: 'error', title: 'Could not unlock', description: result.message });
      }
    } finally {
      setBusy(false);
    }
  }

  // ---- Unlocked -----------------------------------------------------------
  if (seller) {
    const message = `Hi${seller.name ? ` ${seller.name}` : ''}, I saw your listing "${propertyTitle}" on 99Estate and would like to know more.`;

    return (
      <Card className={className}>
        <div className="flex items-center gap-2 text-brand-700">
          <CheckCircle2 className="size-5" aria-hidden />
          <p className="text-sm font-bold uppercase tracking-wide">Contact unlocked</p>
        </div>

        <div className="mt-4">
          <p className="text-lg font-semibold text-ink-950">{seller.name ?? 'Seller'}</p>
          <p className="text-xs text-ink-500">{SELLER_TYPE_LABELS[seller.sellerType]}</p>

          <p className="mt-3 select-all font-mono text-xl font-bold tracking-tight text-ink-950">
            {formatMobile(seller.mobile)}
          </p>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <a
            href={telHref(seller.mobile)}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-field bg-brand-700 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-brand-800"
          >
            <Phone className="size-4" aria-hidden />
            Call
          </a>
          <a
            href={whatsappHref(seller.mobile, message)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-field bg-[#25D366] text-[0.9375rem] font-semibold text-white transition-opacity hover:opacity-90"
          >
            <MessageCircle className="size-4" aria-hidden />
            WhatsApp
          </a>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-ink-500">
          You have permanent access to this contact. Opening it again will never charge you.
        </p>
      </Card>
    );
  }

  // ---- Own listing --------------------------------------------------------
  if (state.code === 'own_listing') {
    return (
      <Card className={className}>
        <p className="text-sm font-semibold text-ink-900">This is your listing</p>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-600">
          Buyers see an <strong className="font-semibold">Unlock Contact</strong> button here. Each
          unlock becomes a lead in your dashboard.
        </p>
        <Button
          variant="outline"
          fullWidth
          className="mt-4"
          onClick={() => router.push('/dashboard/leads')}
        >
          View my leads
        </Button>
      </Card>
    );
  }

  // ---- Unavailable --------------------------------------------------------
  if (state.code === 'unavailable' || state.code === 'not_found') {
    return (
      <Card className={className}>
        <p className="text-sm font-semibold text-ink-900">No longer available</p>
        <p className="mt-1.5 text-sm text-ink-600">
          This listing has been closed or has expired, so its contact cannot be unlocked.
        </p>
      </Card>
    );
  }

  // ---- Locked -------------------------------------------------------------
  const signedOut = state.code === 'sign_in_required';
  const needsProfile = state.code === 'profile_incomplete';
  const mustPay = state.requiresPayment;

  return (
    <>
      <Card className={className}>
        <p className="text-sm font-semibold text-ink-900">
          Contact {SELLER_TYPE_LABELS[sellerType].toLowerCase()}
        </p>
        <p className="mt-0.5 text-[0.9375rem] font-semibold text-ink-950">
          {sellerName ?? 'Verified seller'}
        </p>

        {/* Quota meter — the USP made concrete for this specific click. */}
        <div
          className={cn(
            'mt-4 flex items-start gap-3 rounded-field p-3.5',
            mustPay ? 'bg-accent-50' : 'bg-brand-50',
          )}
        >
          <Sparkles
            className={cn('mt-0.5 size-4 shrink-0', mustPay ? 'text-accent-600' : 'text-brand-600')}
            aria-hidden
          />
          <div className="min-w-0">
            <p className={cn('text-sm font-semibold', mustPay ? 'text-accent-900' : 'text-brand-900')}>
              {signedOut
                ? `${state.freeLimit} free contacts every day`
                : freeRemaining === null
                  ? `${state.freeLimit} free contacts every day`
                  : freeRemaining > 0
                    ? `${freeRemaining} free contact${freeRemaining === 1 ? '' : 's'} available today`
                    : 'Free contacts used for today'}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-600">
              {mustPay && state.resetsAt
                ? `Your free quota returns ${formatQuotaReset(state.resetsAt)}.`
                : `Browsing is always free. Extra contacts cost ₹${state.price} each.`}
            </p>
          </div>
        </div>

        <div className="mt-4">
          {signedOut ? (
            <Button variant="unlock" size="lg" fullWidth onClick={() => void goToAuth('/login')}>
              <Lock className="size-4" aria-hidden />
              Sign in to unlock contact
            </Button>
          ) : needsProfile ? (
            <Button
              variant="unlock"
              size="lg"
              fullWidth
              onClick={() => void goToAuth('/complete-profile')}
            >
              Add your mobile number to unlock
            </Button>
          ) : (
            <Button
              variant="unlock"
              size="lg"
              fullWidth
              loading={busy || payingLabel !== null}
              onClick={handleUnlock}
            >
              {payingLabel ? (
                payingLabel
              ) : (
                <>
                  <Lock className="size-4" aria-hidden />
                  Unlock contact
                  {mustPay ? (
                    <span className="ml-1 rounded bg-ink-950/15 px-2 py-0.5 text-sm font-bold">
                      ₹{state.price}
                    </span>
                  ) : null}
                </>
              )}
            </Button>
          )}
        </div>

        {mustPay ? (
          <p className="mt-2.5 text-center text-[0.6875rem] text-ink-500">
            Pay by UPI, card, net banking or wallet · secured by Razorpay
          </p>
        ) : null}

        <ul className="mt-4 space-y-1.5">
          <Assurance>Property details are free — you only pay for the contact</Assurance>
          <Assurance>Unlocking the same property twice never charges again</Assurance>
          <Assurance>No brokerage and no commission on your deal</Assurance>
        </ul>
      </Card>
    </>
  );
}

function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('rounded-card border border-ink-200 bg-white p-5 shadow-card', className)}>
      {children}
    </div>
  );
}

function Assurance({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-xs leading-relaxed text-ink-600">
      <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-brand-600" aria-hidden />
      {children}
    </li>
  );
}

/** Compact sticky bar shown on phones so the CTA is never scrolled away (§22). */
export function StickyUnlockBar({
  price,
  requiresPayment,
  unlocked,
  onClick,
}: {
  price: number;
  requiresPayment: boolean;
  unlocked: boolean;
  onClick: () => void;
}) {
  if (unlocked) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-200 bg-white/95 p-3 backdrop-blur-md lg:hidden">
      <Button variant="unlock" size="lg" fullWidth onClick={onClick}>
        <BadgeCheck className="size-4" aria-hidden />
        Unlock contact
        {requiresPayment ? (
          <span className="ml-1 rounded bg-ink-950/15 px-2 py-0.5 text-sm font-bold">₹{price}</span>
        ) : null}
      </Button>
    </div>
  );
}
