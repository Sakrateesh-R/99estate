import Image from 'next/image';
import Link from 'next/link';
import {
  Accessibility,
  ArrowRight,
  BedDouble,
  Building2,
  CircleDollarSign,
  Eye,
  Factory,
  Home,
  LandPlot,
  LockKeyhole,
  MapPin,
  MessagesSquare,
  Search,
  ShieldCheck,
  Store,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { HeroSearch } from '@/components/property/hero-search';
import { PropertyRail } from '@/components/property/property-rail';
import { ButtonLink } from '@/components/ui/button';
import {
  getActiveCities,
  getBrowseCategories,
  getCardMeta,
  getFeaturedProperties,
  getLatestProperties,
  getPopularLocations,
} from '@/lib/properties/queries';
import { FREE_DAILY_UNLOCKS, PAID_UNLOCK_PRICE, SITE_NAME } from '@/lib/constants';
import type { Metadata } from 'next';

/**
 * Without an explicit canonical the home page is reachable, and indexable, at
 * more than one address — with a trailing slash, with tracking parameters on
 * a shared link. Naming one address consolidates those into a single entry.
 */
export const metadata: Metadata = {
  title: `${SITE_NAME} — Property for sale, rent and PG across India`,
  description: `Browse verified property listings free on ${SITE_NAME}. Full details, photos and location at no cost — ${FREE_DAILY_UNLOCKS} seller contacts free every day, ₹${PAID_UNLOCK_PRICE} after that. Posting is always free.`,
  alternates: { canonical: '/' },
};

/**
 * Home page (§21).
 *
 * The page has one job beyond search: make the pricing model unmistakable.
 * Every other marketplace in this category hides the cost of contacting a
 * seller, so "free to browse, 2 free contacts a day, ₹9 after" is stated in
 * the hero, restated as a band, and proved again in "How it works".
 */
export default async function HomePage() {
  // Independent reads — fire them together rather than waterfalling.
  const [featured, latest, locations, categories, cities] = await Promise.all([
    getFeaturedProperties(8),
    getLatestProperties(8),
    getPopularLocations(12),
    getBrowseCategories(),
    getActiveCities(),
  ]);

  // One batched lookup covering both rails rather than one per card.
  const { photoCounts, savedIds, unlocked } = await getCardMeta([
    ...new Set([...featured, ...latest].map((p) => p.id)),
  ]);

  return (
    <>
      <Hero cities={cities} backdrop={featured[0]?.cover_image_url ?? latest[0]?.cover_image_url ?? null} />
      <UspBand />

      {/*
        Hidden entirely when there is nothing to feature, rather than shown with
        an empty state. "No featured listings yet" told a buyer about a slot
        scheme they have no part in, directly above real properties they could
        have been looking at — the same reasoning the categories and locations
        sections below already follow.
      */}
      {featured.length > 0 ? (
        <PropertyRail
          title="Featured properties"
          description="Hand-picked listings from verified sellers."
          properties={featured}
          viewAllHref="/properties?featured=1"
          priority
          photoCounts={photoCounts}
          savedIds={savedIds}
          unlocked={unlocked}
        />
      ) : null}

      {categories.length > 0 ? <BrowseByType categories={categories} /> : null}

      <PropertyRail
        title="Latest properties"
        description="Freshly listed across every city we cover."
        properties={latest}
        viewAllHref="/properties"
        viewAllLabel="Browse all properties"
        emptyTitle="No listings yet"
        emptyDescription="This marketplace is brand new. Post the first property — it costs nothing and takes a few minutes."
        /*
          Takes over the eager image loading when the featured rail is gone: with
          nothing above it, this rail holds the largest image on screen, and
          leaving it lazy would delay the one thing the page is measured on.
        */
        priority={featured.length === 0}
        photoCounts={photoCounts}
        savedIds={savedIds}
        unlocked={unlocked}
      />

      {locations.length > 0 ? <PopularLocations locations={locations} /> : null}

      <HowItWorks />
      <WhyEstate />
      <SellerCta />
    </>
  );
}

/* ------------------------------------------------------------------ Hero */

function Hero({
  cities,
  backdrop,
}: {
  cities: { city: string; state: string }[];
  backdrop: string | null;
}) {
  return (
    <section className="relative overflow-hidden bg-ink-950">
      {/* Real listing photography behind the hero, the way every property
          portal opens. Falls back to the gradient when the marketplace has no
          listings yet, so a fresh install still looks deliberate. */}
      {backdrop ? (
        <Image
          src={backdrop}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover opacity-45"
        />
      ) : null}

      <div
        className={backdrop ? 'absolute inset-0 bg-ink-950/45' : 'absolute inset-0 opacity-45'}
        style={
          backdrop
            ? undefined
            : {
                backgroundImage:
                  'radial-gradient(55rem 38rem at 78% -15%, #0f8364 0%, transparent 62%), radial-gradient(42rem 30rem at 4% 108%, #b74806 0%, transparent 58%)',
              }
        }
        aria-hidden
      />

      {/* Bottom scrim so the search card always has contrast beneath it. */}
      <div
        className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-ink-950 to-transparent"
        aria-hidden
      />

      <div className="container-page relative py-12 sm:py-16 lg:py-20">
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-accent-200 ring-1 ring-inset ring-white/20 backdrop-blur-sm">
            <Zap className="size-3.5" aria-hidden />
            {FREE_DAILY_UNLOCKS} seller contacts free, every day
          </span>

          <h1 className="mt-4 text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-[3.5rem]">
            Find Your Next Property
          </h1>

          <p className="mt-4 max-w-xl text-[1.0625rem] leading-relaxed text-ink-100">
            Browse every listing in full — photos, price, locality, specifications — without paying
            a rupee. Pay only to reach the seller, and only after your {FREE_DAILY_UNLOCKS} free
            contacts for the day are used.
          </p>
        </div>

        <div className="mt-8 max-w-5xl">
          <HeroSearch cities={cities} />
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- USP band */

const USPS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Eye,
    title: 'Browse properties for FREE',
    body: 'Full details, every photo, exact locality. No blurred prices, no "register to view".',
  },
  {
    icon: LockKeyhole,
    title: `Get ${FREE_DAILY_UNLOCKS} contacts FREE every day`,
    body: 'Your quota resets at midnight IST. Unused contacts do not roll over — and they do not cost you either.',
  },
  {
    icon: CircleDollarSign,
    title: `₹${PAID_UNLOCK_PRICE} for additional contacts`,
    body: 'A flat nine rupees per seller. No brokerage, no subscription, no commission on your deal.',
  },
];

function UspBand() {
  return (
    <section className="border-y border-ink-200 bg-white">
      <div className="container-page grid gap-8 py-10 sm:grid-cols-3 lg:py-12">
        {USPS.map(({ icon: Icon, title, body }) => (
          <div key={title} className="flex gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
              <Icon className="size-5" aria-hidden />
            </span>
            <div>
              <h3 className="text-[0.9375rem] font-semibold text-ink-950">{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-600">{body}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* --------------------------------------------------------- Browse by type */

/**
 * `property_categories.icon` holds a lucide name chosen by an admin. Resolving
 * it through a small allow-list keeps the icon set tree-shakeable — importing
 * all of lucide to look one up by string would cost hundreds of KB.
 */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Building2,
  Home,
  LandPlot,
  Store,
  Factory,
  BedDouble,
  Accessibility,
};

function BrowseByType({
  categories,
}: {
  categories: { slug: string; label: string; icon: string | null; propertyTypes: string[] }[];
}) {
  return (
    <section className="border-t border-ink-200 bg-white">
      <div className="container-page py-12 lg:py-16">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Browse by property type</h2>
        <p className="mt-2 text-[0.9375rem] text-ink-600">
          Jump straight to the kind of place you are looking for.
        </p>

        <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {categories.map((category) => {
            const Icon = (category.icon && CATEGORY_ICONS[category.icon]) || Building2;
            return (
              <Link
                key={category.slug}
                href={`/properties?type=${category.propertyTypes.join(',')}`}
                className="group flex flex-col items-center gap-3 rounded-card border border-ink-200 bg-white px-4 py-6 text-center transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-card"
              >
                <span className="grid size-12 place-items-center rounded-2xl bg-ink-100 text-ink-600 transition-colors group-hover:bg-brand-50 group-hover:text-brand-700">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="text-sm font-semibold text-ink-900">{category.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------- Popular locations */

function PopularLocations({
  locations,
}: {
  locations: { city: string; state: string; listingCount: number }[];
}) {
  return (
    <section className="container-page py-12 lg:py-16">
      <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Popular locations</h2>
      <p className="mt-2 text-[0.9375rem] text-ink-600">
        Where buyers and tenants are searching right now.
      </p>

      <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {locations.map((location) => (
          <Link
            key={`${location.state}-${location.city}`}
            href={`/properties?city=${encodeURIComponent(location.city)}`}
            className="group flex items-center justify-between gap-2 rounded-card border border-ink-200 bg-white px-4 py-3.5 transition-colors hover:border-brand-300 hover:bg-brand-50/40"
          >
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
                <MapPin className="size-3.5 shrink-0 text-ink-400" aria-hidden />
                <span className="truncate">{location.city}</span>
              </span>
              <span className="mt-0.5 block truncate pl-5 text-xs text-ink-500">
                {location.listingCount > 0
                  ? `${location.listingCount} ${location.listingCount === 1 ? 'listing' : 'listings'}`
                  : location.state}
              </span>
            </span>
            <ArrowRight
              className="size-4 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600"
              aria-hidden
            />
          </Link>
        ))}
      </div>
    </section>
  );
}

/* --------------------------------------------------------- How it works */

const STEPS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Search,
    title: 'Search and shortlist — free',
    body: 'Filter by city, budget, BHK and more. Open any listing and read every detail without signing up.',
  },
  {
    icon: LockKeyhole,
    title: 'Unlock the seller contact',
    body: `Your first ${FREE_DAILY_UNLOCKS} unlocks each day are free. After that it is a flat ₹${PAID_UNLOCK_PRICE} — and unlocking the same property twice never charges you again.`,
  },
  {
    icon: MessagesSquare,
    title: 'Call or WhatsApp directly',
    body: 'You get the seller’s real number. No call centre, no agent in the middle, no commission on the deal.',
  },
];

function HowItWorks() {
  return (
    <section className="border-t border-ink-200 bg-white">
      <div className="container-page py-12 lg:py-16">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">How 99Estate works</h2>

        <ol className="mt-8 grid gap-6 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, body }, index) => (
            <li key={title} className="relative rounded-card border border-ink-200 bg-ink-50/60 p-6">
              <span className="absolute right-5 top-5 font-display text-4xl font-bold text-ink-200">
                {index + 1}
              </span>
              <span className="grid size-11 place-items-center rounded-xl bg-brand-700 text-white">
                <Icon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-4 pr-10 text-base font-semibold text-ink-950">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-600">{body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------- Why 99Estate */

const REASONS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Eye,
    title: 'Nothing is hidden behind a paywall',
    body: 'Price, photos, locality, specifications and amenities are visible to everyone, always.',
  },
  {
    icon: ShieldCheck,
    title: 'Your number stays private',
    body: 'A seller’s phone number is never in a listing, a search result or a page source — only a completed unlock reveals it.',
  },
  {
    icon: CircleDollarSign,
    title: 'No brokerage, ever',
    body: `We charge ₹${PAID_UNLOCK_PRICE} for a contact. We do not take a cut of your sale, your rent or your deposit.`,
  },
  {
    icon: Building2,
    title: 'Free for sellers',
    body: 'Posting is free and stays free. You only ever hear from buyers who cared enough to unlock your contact.',
  },
];

function WhyEstate() {
  return (
    <section className="container-page py-12 lg:py-16">
      <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Why 99Estate</h2>

      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        {REASONS.map(({ icon: Icon, title, body }) => (
          <div key={title} className="flex gap-4 rounded-card border border-ink-200 bg-white p-5">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-50 text-accent-700">
              <Icon className="size-5" aria-hidden />
            </span>
            <div>
              <h3 className="text-[0.9375rem] font-semibold text-ink-950">{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-600">{body}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ Seller CTA */

function SellerCta() {
  return (
    <section className="container-page pb-16 lg:pb-20">
      <div className="relative overflow-hidden rounded-card bg-ink-950 px-6 py-12 sm:px-12 lg:py-16">
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              'radial-gradient(34rem 22rem at 88% 8%, #0f8364 0%, transparent 60%), radial-gradient(28rem 20rem at 6% 96%, #b74806 0%, transparent 58%)',
          }}
          aria-hidden
        />

        <div className="relative max-w-2xl">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Have a property to sell or rent?
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-ink-200">
            List it in minutes, for free, and get leads from buyers who have already paid attention —
            every contact unlock lands in your dashboard with the buyer&rsquo;s name and number.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/dashboard/properties/new" variant="unlock" size="lg">
              Post your property — free
            </ButtonLink>
            <ButtonLink
              href="/how-it-works"
              size="lg"
              className="border border-white/25 bg-white/5 text-white hover:bg-white/10"
              variant="ghost"
            >
              See how it works
            </ButtonLink>
          </div>
        </div>
      </div>
    </section>
  );
}
