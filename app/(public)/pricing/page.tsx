import type { Metadata } from 'next';
import { Check, X } from 'lucide-react';
import { ButtonLink } from '@/components/ui/button';
import {
  FREE_DAILY_UNLOCKS,
  LISTING_DURATION_DAYS,
  PAID_UNLOCK_PRICE,
  SITE_NAME,
} from '@/lib/constants';

export const metadata: Metadata = {
  title: 'Pricing',
  description: `Browsing and posting are free on ${SITE_NAME}. ${FREE_DAILY_UNLOCKS} seller contacts free every day, then ₹${PAID_UNLOCK_PRICE} each. No brokerage or subscription.`,
  alternates: { canonical: '/pricing' },
};

const INCLUDED = [
  'Every listing viewable in full — photos, price, locality, specifications',
  'Unlimited searching and filtering',
  'Unlimited saved properties',
  `${FREE_DAILY_UNLOCKS} seller contacts every single day`,
  'Unlimited property listings, posted free',
  `Each listing live for ${LISTING_DURATION_DAYS} days, renewable`,
  'Lead inbox with buyer name and number',
];

const NOT_CHARGED = [
  'Brokerage or commission on your sale, rent or deposit',
  'Subscription or membership fees',
  'Charges to view a property or its price',
  'Charges to post, edit or renew a listing',
  'Charges to re-open a contact you already unlocked',
];

export default function PricingPage() {
  return (
    <div className="container-page py-10 lg:py-14">
      <header className="max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Pricing</h1>
        <p className="mt-3 text-lg leading-relaxed text-ink-600">
          One charge exists on {SITE_NAME}, and this is it.
        </p>
      </header>

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <div className="rounded-card border-2 border-brand-600 bg-white p-6 sm:p-8">
          <p className="text-xs font-bold uppercase tracking-wider text-brand-700">
            Everything below costs
          </p>
          <p className="price mt-2 text-5xl">₹0</p>
          <p className="mt-2 text-sm text-ink-600">
            No account needed to browse. No card on file. Ever.
          </p>

          <ul className="mt-6 space-y-2.5">
            {INCLUDED.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-ink-700">
                <Check className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-card border-2 border-accent-400 bg-accent-50/50 p-6 sm:p-8">
          <p className="text-xs font-bold uppercase tracking-wider text-accent-800">
            The only thing we charge for
          </p>
          <p className="price mt-2 text-5xl">
            ₹{PAID_UNLOCK_PRICE}
            <span className="ml-2 align-middle text-base font-medium text-ink-600">
              per extra contact
            </span>
          </p>
          <p className="mt-2 text-sm text-ink-700">
            Charged only after your {FREE_DAILY_UNLOCKS} free contacts for the day are used.
          </p>

          <div className="mt-6 space-y-3 text-sm leading-relaxed text-ink-700">
            <p>
              The ₹{PAID_UNLOCK_PRICE} buys the seller&rsquo;s phone number — nothing else. The
              property itself was already free to view in full, and stays that way.
            </p>
            <p>
              Your quota resets at <strong className="font-semibold">midnight IST</strong>, so a
              patient buyer can pay nothing indefinitely. That is deliberate.
            </p>
            <p>
              Unlocking a property you have unlocked before never charges again, no matter how
              much later you come back to it.
            </p>
          </div>
        </div>
      </div>

      <section className="mt-10 rounded-card border border-ink-200 bg-white p-6 sm:p-8">
        <h2 className="text-xl font-bold tracking-tight">What we never charge for</h2>
        <ul className="mt-5 grid gap-2.5 sm:grid-cols-2">
          {NOT_CHARGED.map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-sm text-ink-700">
              <X className="mt-0.5 size-4 shrink-0 text-red-500" aria-hidden />
              {item}
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-10 flex flex-wrap gap-3">
        <ButtonLink href="/properties" size="lg">
          Start browsing — free
        </ButtonLink>
        <ButtonLink href="/how-it-works" variant="outline" size="lg">
          How it works
        </ButtonLink>
      </div>
    </div>
  );
}
