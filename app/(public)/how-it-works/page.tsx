import type { Metadata } from 'next';
import {
  CircleDollarSign,
  Eye,
  LockKeyhole,
  MessagesSquare,
  Search,
  ShieldCheck,
  Building2,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ButtonLink } from '@/components/ui/button';
import {
  FREE_DAILY_UNLOCKS,
  LISTING_DURATION_DAYS,
  PAID_UNLOCK_PRICE,
  SITE_NAME,
} from '@/lib/constants';

export const metadata: Metadata = {
  title: 'How it works',
  description: `Browse every listing free. ${FREE_DAILY_UNLOCKS} seller contacts free every day, then ₹${PAID_UNLOCK_PRICE} each. No brokerage, no subscription.`,
  alternates: { canonical: '/how-it-works' },
};

const BUYER_STEPS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Search,
    title: 'Search and shortlist — free',
    body: 'Filter by city, locality, budget, BHK, area, furnishing and more. Open any listing and read every detail — photos, exact price, locality, specifications — without an account.',
  },
  {
    icon: LockKeyhole,
    title: 'Unlock the seller’s contact',
    body: `Your first ${FREE_DAILY_UNLOCKS} unlocks each day cost nothing. After that it is a flat ₹${PAID_UNLOCK_PRICE} per seller. Your free quota resets at midnight IST, every day.`,
  },
  {
    icon: MessagesSquare,
    title: 'Call or WhatsApp directly',
    body: 'You get the seller’s real number — no call centre, no agent inserted in the middle, and no commission taken from your deal.',
  },
];

const SELLER_STEPS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Building2,
    title: 'Post your property — free',
    body: 'A seven-step form covering the basics, specifications, location, amenities and photos. Posting is free and stays free; there is no paid tier that outranks you.',
  },
  {
    icon: ShieldCheck,
    title: 'We review it',
    body: `Every listing passes moderation before going live, which keeps the search results worth trusting. Once approved it runs for ${LISTING_DURATION_DAYS} days and can be renewed.`,
  },
  {
    icon: Users,
    title: 'Receive qualified leads',
    body: 'Every buyer who unlocks your contact becomes a lead in your dashboard, with their name and number. They have chosen to reach you, so they are worth calling back.',
  },
];

export default function HowItWorksPage() {
  return (
    <div className="container-page py-10 lg:py-14">
      <header className="max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          How {SITE_NAME} works
        </h1>
        <p className="mt-3 text-lg leading-relaxed text-ink-600">
          Most property sites make money by selling your attention, then charging you to find
          out who is on the other end. We charge ₹{PAID_UNLOCK_PRICE} for a phone number and
          nothing else.
        </p>
      </header>

      <Section title="If you are buying or renting" steps={BUYER_STEPS} />
      <Section title="If you are selling or letting" steps={SELLER_STEPS} />

      <section className="mt-12 rounded-card border border-ink-200 bg-white p-6 sm:p-8">
        <h2 className="text-xl font-bold tracking-tight">The rules, in plain terms</h2>
        <dl className="mt-5 grid gap-5 sm:grid-cols-2">
          <Rule icon={Eye} term="Browsing is always free">
            Price, photos, locality, specifications and amenities are visible to everyone. There
            is no blurred price and no “register to view”.
          </Rule>
          <Rule icon={LockKeyhole} term={`${FREE_DAILY_UNLOCKS} free contacts every day`}>
            The quota resets at 00:00 IST — a calendar day, not a rolling 24 hours. Unused
            contacts do not roll over, and they do not cost you anything either.
          </Rule>
          <Rule icon={CircleDollarSign} term={`₹${PAID_UNLOCK_PRICE} after that`}>
            A flat fee per seller, decided by our server and never by the page you are on. No
            subscription, no brokerage, no cut of your sale or rent.
          </Rule>
          <Rule icon={ShieldCheck} term="Never charged twice">
            Unlocking a property you have already unlocked is always free, however long ago it
            was. The database enforces this, not the interface.
          </Rule>
        </dl>
      </section>

      <div className="mt-10 flex flex-wrap gap-3">
        <ButtonLink href="/properties" size="lg">
          Browse properties
        </ButtonLink>
        <ButtonLink href="/dashboard/properties/new" variant="outline" size="lg">
          Post a property — free
        </ButtonLink>
      </div>
    </div>
  );
}

function Section({
  title,
  steps,
}: {
  title: string;
  steps: { icon: LucideIcon; title: string; body: string }[];
}) {
  return (
    <section className="mt-12">
      <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h2>
      <ol className="mt-5 grid gap-5 md:grid-cols-3">
        {steps.map(({ icon: Icon, title: stepTitle, body }, index) => (
          <li key={stepTitle} className="relative rounded-card border border-ink-200 bg-white p-6">
            <span className="absolute right-5 top-4 font-display text-4xl font-bold text-ink-100">
              {index + 1}
            </span>
            <span className="grid size-11 place-items-center rounded-xl bg-brand-700 text-white">
              <Icon className="size-5" aria-hidden />
            </span>
            <h3 className="mt-4 pr-8 text-base font-semibold text-ink-950">{stepTitle}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-600">{body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Rule({
  icon: Icon,
  term,
  children,
}: {
  icon: LucideIcon;
  term: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3.5">
      <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
        <Icon className="size-4" aria-hidden />
      </span>
      <div>
        <dt className="text-[0.9375rem] font-semibold text-ink-950">{term}</dt>
        <dd className="mt-1 text-sm leading-relaxed text-ink-600">{children}</dd>
      </div>
    </div>
  );
}
