import type { Metadata } from 'next';
import { ButtonLink } from '@/components/ui/button';
import { FREE_DAILY_UNLOCKS, PAID_UNLOCK_PRICE, SITE_NAME } from '@/lib/constants';

export const metadata: Metadata = {
  title: `About ${SITE_NAME}`,
  description: `${SITE_NAME} is a property marketplace that does not charge you to look. Browse free, ${FREE_DAILY_UNLOCKS} contacts free daily, ₹${PAID_UNLOCK_PRICE} after that.`,
  alternates: { canonical: '/about' },
};

export default function AboutPage() {
  return (
    <div className="container-page py-10 lg:py-14">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">About {SITE_NAME}</h1>

        <div className="mt-6 space-y-5 text-[1.0625rem] leading-relaxed text-ink-700">
          <p>
            Looking for a home in India usually means handing over your phone number before you
            have seen anything, then fielding calls from people who are not selling the property
            you asked about.
          </p>
          <p>
            {SITE_NAME} inverts that. Every listing is fully visible to everyone — the price, the
            photographs, the locality, the specifications — with no account and no cost. You
            decide who to call, and you reach that person directly.
          </p>
          <p>
            We charge ₹{PAID_UNLOCK_PRICE} to reveal a seller&rsquo;s number, and only after your{' '}
            {FREE_DAILY_UNLOCKS} free contacts for the day are used. That is the entire business
            model. We take no brokerage, no commission and no subscription, which means we have no
            reason to stand between you and the person on the other end.
          </p>
          <p>
            For sellers, posting is free and stays free. There is no paid tier that outranks an
            honest listing, and the only people who reach you are ones who chose to.
          </p>
        </div>

        <div className="mt-8 rounded-card border border-ink-200 bg-white p-6">
          <h2 className="text-base font-semibold text-ink-950">On your phone number</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-600">
            A seller&rsquo;s number never appears in a listing, a search result or the source of a
            page. It is released to one buyer at a time, only when that buyer unlocks it, and the
            seller sees exactly who did. This is enforced in the database rather than the
            interface, so it holds regardless of what any page decides to render.
          </p>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/properties" size="lg">
            Browse properties
          </ButtonLink>
          <ButtonLink href="/pricing" variant="outline" size="lg">
            See pricing
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
