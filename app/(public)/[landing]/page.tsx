import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight, SearchX } from 'lucide-react';
import { PropertyCard } from '@/components/property/property-card';
import { EmptyState } from '@/components/ui/empty-state';
import { ButtonLink } from '@/components/ui/button';
import { Pagination } from '@/components/ui/pagination';
import { getCardMeta } from '@/lib/properties/queries';
import { searchProperties } from '@/lib/properties/search';
import { parseFilters, buildSearchParams } from '@/lib/properties/filters';
import { propertyPath } from '@/lib/utils';
import { formatListingPrice } from '@/lib/format';
import { SITE_NAME, FREE_DAILY_UNLOCKS, PAID_UNLOCK_PRICE } from '@/lib/constants';
import {
  parseLandingSlug,
  landingPath,
  landingHeading,
  landingTypeGroups,
  type LandingTypeGroup,
} from '@/lib/seo/landing';
import { resolvePlace, landingCities, localitiesIn, type ResolvedPlace } from '@/lib/seo/places';
import { JsonLd, breadcrumbJsonLd, itemListJsonLd, faqJsonLd } from '@/lib/seo/json-ld';
import type { Enums } from '@/types/database.types';

/**
 * §23 — the SEO landing pages.
 *
 * One indexable URL per real search intent: a city, an optional locality, a
 * listing type and optionally a property type. See `lib/seo/landing.ts` for
 * the URL grammar.
 *
 * This is a single dynamic segment sitting at the root of the public group,
 * so it sees every unmatched one-segment path. Static routes still win — Next
 * matches literal segments first — but anything the grammar does not
 * recognise, and any place not in the catalog, must 404 rather than render an
 * empty result set. An indexable page with no inventory is worse than no page.
 */

type PageProps = {
  params: Promise<{ landing: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Inventory changes through the day; an hour keeps counts honest without
// rebuilding these on every request.
export const revalidate = 3600;

type Resolved = {
  place: ResolvedPlace;
  typeGroup: LandingTypeGroup | null;
  listing: Enums<'listing_type'>;
  canonical: string;
  heading: string;
};

async function resolve(slug: string): Promise<Resolved | null> {
  const parsed = parseLandingSlug(slug);
  if (!parsed) return null;

  const place = await resolvePlace(parsed.placeSlug);
  if (!place) return null;

  return {
    place,
    typeGroup: parsed.typeGroup,
    listing: parsed.listing,
    canonical: landingPath({
      city: place.city,
      locality: place.locality,
      listing: parsed.listing,
      typeSlug: parsed.typeGroup?.slug ?? null,
    }),
    heading: landingHeading({
      typeGroup: parsed.typeGroup,
      listing: parsed.listing,
      city: place.city,
      locality: place.locality,
    }),
  };
}

/** The landing URL maps onto the same filter model the search page uses. */
function filtersFor(r: Resolved, page: number) {
  return parseFilters({
    city: r.place.city,
    locality: r.place.locality ?? undefined,
    listing: r.listing,
    type: r.typeGroup?.types.join(','),
    page: String(page),
    view: 'grid',
  });
}

function pageNumber(raw: string | string[] | undefined): number {
  const n = Number.parseInt(Array.isArray(raw) ? (raw[0] ?? '1') : (raw ?? '1'), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 400) : 1;
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const r = await resolve((await params).landing);
  if (!r) return { title: 'Not found', robots: { index: false, follow: false } };

  const page = pageNumber((await searchParams).page);
  const { total } = await searchProperties(filtersFor(r, page));

  const where = [r.place.locality, r.place.city].filter(Boolean).join(', ');
  const suffix = page > 1 ? ` — page ${page}` : '';

  /**
   * The count leads because it is the one thing a searcher wants before
   * clicking, but it has to agree with itself grammatically — "1 apartments"
   * in a search result reads as a broken page.
   *
   * Nothing here claims the listings are verified. Verification is a per
   * listing status, and asserting it for a whole page would be untrue for
   * most of them.
   */
  const description =
    total > 0
      ? `${total.toLocaleString('en-IN')} ${total === 1 ? 'listing' : 'listings'} — ${r.heading} on ${SITE_NAME}. View full details, photos and location free. ${FREE_DAILY_UNLOCKS} seller contacts free every day, ₹${PAID_UNLOCK_PRICE} after that.`
      : `${r.heading} on ${SITE_NAME}. View full details free, with ${FREE_DAILY_UNLOCKS} seller contacts free every day and ₹${PAID_UNLOCK_PRICE} after that. Posting is always free.`;

  return {
    title: `${r.heading}${suffix}`,
    description,
    alternates: { canonical: r.canonical },
    openGraph: {
      type: 'website',
      title: `${r.heading} | ${SITE_NAME}`,
      description,
      url: r.canonical,
    },
    // Pages 2+ are real pages but must not compete with page one for the
    // same query; `follow` still lets the crawler reach the listings on them.
    // A page with nothing on it should not be indexed at all.
    robots: page > 1 || total === 0 ? { index: false, follow: true } : undefined,
    other: { 'geo.placename': where, 'geo.region': `IN-${r.place.state}` },
  };
}

export default async function LandingPage({ params, searchParams }: PageProps) {
  const r = await resolve((await params).landing);
  if (!r) notFound();

  const page = pageNumber((await searchParams).page);
  const filters = filtersFor(r, page);
  const { items, total, pageCount } = await searchProperties(filters);

  const [{ photoCounts, savedIds, unlocked }, localities, cities] = await Promise.all([
    getCardMeta(items.map((p) => p.id)),
    r.place.locality ? Promise.resolve([]) : localitiesIn(r.place.city),
    landingCities(),
  ]);

  const where = [r.place.locality, r.place.city].filter(Boolean).join(', ');

  const crumbs = [
    { name: 'Home', path: '/' },
    { name: 'Properties', path: '/properties' },
    { name: r.place.city, path: landingPath({ city: r.place.city, listing: r.listing }) },
    ...(r.place.locality ? [{ name: r.place.locality, path: r.canonical }] : []),
  ];

  const prices = items.map((p) => Number(p.price)).filter((n) => Number.isFinite(n) && n > 0);
  const priceRange =
    prices.length > 1
      ? `${formatListingPrice(Math.min(...prices), r.listing)} – ${formatListingPrice(Math.max(...prices), r.listing)}`
      : null;

  const faqs = buildFaqs({ heading: r.heading, where, total, priceRange, listing: r.listing });

  return (
    <div className="container-page py-6 lg:py-8">
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      {items.length > 0 ? (
        <JsonLd
          data={itemListJsonLd({ name: r.heading, paths: items.map((p) => propertyPath(p)) })}
        />
      ) : null}
      <JsonLd data={faqJsonLd(faqs)} />

      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm text-ink-500">
        {crumbs.map((crumb, i) => (
          <span key={crumb.path} className="flex items-center gap-1">
            {i > 0 ? <ChevronRight className="size-3.5" aria-hidden /> : null}
            {i === crumbs.length - 1 ? (
              <span className="text-ink-700">{crumb.name}</span>
            ) : (
              <Link href={crumb.path} className="hover:text-ink-900">
                {crumb.name}
              </Link>
            )}
          </span>
        ))}
      </nav>

      <header className="mt-4">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{r.heading}</h1>
        <p className="mt-1.5 text-[0.9375rem] text-ink-600">
          {total > 0 ? (
            <>
              <strong className="font-semibold text-ink-900">{total.toLocaleString('en-IN')}</strong>{' '}
              {total === 1 ? 'listing' : 'listings'} in {where}
              {priceRange ? <> · {priceRange}</> : null}. Every listing is free to view in full —
              you only pay to unlock a seller&rsquo;s contact, and your first two each day are free.
            </>
          ) : (
            <>
              No live listings in {where} right now. Browse nearby, or post the first one — posting
              is free.
            </>
          )}
        </p>
      </header>

      {items.length === 0 ? (
        <EmptyState
          className="mt-8"
          icon={<SearchX className="size-6" />}
          title={`Nothing listed in ${where} yet`}
          description="Try a nearby locality or a different property type — or be the first to list here."
          action={
            <>
              <ButtonLink href="/properties" variant="outline">
                Browse all properties
              </ButtonLink>
              <ButtonLink href="/dashboard/properties/new">Post a property</ButtonLink>
            </>
          }
        />
      ) : (
        <>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((property, index) => (
              <PropertyCard
                key={property.id}
                property={property}
                priority={index < 3}
                isSaved={savedIds.has(property.id)}
                photoCount={photoCounts.get(property.id)}
                unlocked={unlocked.get(property.id)}
              />
            ))}
          </div>

          <Pagination
            className="mt-10"
            page={page}
            pageCount={pageCount}
            buildHref={(target) => (target > 1 ? `${r.canonical}?page=${target}` : r.canonical)}
          />

          <p className="mt-6 text-sm text-ink-500">
            Looking for something more specific?{' '}
            <Link
              href={`/properties?${buildSearchParams(filters).toString()}`}
              className="font-medium text-brand-700 underline underline-offset-2"
            >
              Filter by budget, BHK and amenities
            </Link>
            .
          </p>
        </>
      )}

      {/* Internal linking. These are the paths a crawler follows to discover
          the rest of the landing set, and the paths a visitor follows when
          this page is not quite what they wanted. */}
      <div className="mt-12 space-y-8 border-t border-ink-200 pt-8">
        <LinkRow
          title={`Other options in ${r.place.city}`}
          links={otherIntents(r)}
        />

        {localities.length > 0 ? (
          <LinkRow
            title={`Popular localities in ${r.place.city}`}
            links={localities.slice(0, 18).map((l) => ({
              label: l.locality ?? '',
              href: landingPath({ city: l.city, locality: l.locality, listing: r.listing }),
            }))}
          />
        ) : null}

        <LinkRow
          title="Other cities"
          links={cities
            .filter((c) => c.city !== r.place.city)
            .slice(0, 18)
            .map((c) => ({
              label: c.city,
              href: landingPath({ city: c.city, listing: r.listing }),
            }))}
        />
      </div>

      <section className="mt-12 border-t border-ink-200 pt-8">
        <h2 className="text-xl font-bold tracking-tight">Frequently asked</h2>
        <dl className="mt-4 space-y-5">
          {faqs.map((faq) => (
            <div key={faq.question}>
              <dt className="font-semibold text-ink-900">{faq.question}</dt>
              <dd className="mt-1 text-[0.9375rem] leading-relaxed text-ink-700">{faq.answer}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

function LinkRow({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  if (links.length === 0) return null;

  return (
    <section>
      <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
      <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="text-sm text-ink-600 hover:text-brand-700 hover:underline">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The sibling pages for the same place: other intents, and the typed pages. */
function otherIntents(r: Resolved): { label: string; href: string }[] {
  const place = { city: r.place.city, locality: r.place.locality };
  const links: { label: string; href: string }[] = [];

  const intents: { listing: Enums<'listing_type'>; label: string }[] = [
    { listing: 'sale', label: 'For sale' },
    { listing: 'rent', label: 'For rent' },
    { listing: 'pg', label: 'PG & co-living' },
  ];

  for (const intent of intents) {
    const href = landingPath({ ...place, listing: intent.listing });
    if (href !== r.canonical) links.push({ label: `${intent.label} in ${r.place.city}`, href });
  }

  // PG has no meaningful property-type split.
  if (r.listing !== 'pg') {
    for (const group of landingTypeGroups()) {
      const href = landingPath({ ...place, listing: r.listing, typeSlug: group.slug });
      if (href !== r.canonical) {
        links.push({
          label: `${group.plural} ${r.listing === 'rent' ? 'for rent' : 'for sale'}`,
          href,
        });
      }
    }
  }

  return links;
}

/**
 * FAQs, answered from this page's own numbers.
 *
 * Generic boilerplate repeated across hundreds of landing pages is a spam
 * signal, so every answer here says something specific to this place — the
 * live count, the observed price range, the rules that actually apply.
 */
function buildFaqs(input: {
  heading: string;
  where: string;
  total: number;
  priceRange: string | null;
  listing: Enums<'listing_type'>;
}) {
  const noun = input.listing === 'pg' ? 'PG options' : 'properties';

  const faqs = [
    {
      question: `How many ${noun} are listed in ${input.where}?`,
      answer:
        input.total > 0
          ? `${input.total.toLocaleString('en-IN')} live ${input.total === 1 ? 'listing is' : 'listings are'} available in ${input.where} on ${SITE_NAME} right now. Listings expire automatically, so this count reflects what is currently active.`
          : `There are no live listings in ${input.where} on ${SITE_NAME} at the moment. Posting is free, so new ones appear as soon as owners and agents add them.`,
    },
    {
      question: `Is it free to view ${noun} in ${input.where}?`,
      answer: `Yes. Browsing and viewing full listing details is free on ${SITE_NAME}, including photos, location and amenities. You only pay to unlock a seller's phone number.`,
    },
    {
      question: 'How much does it cost to contact a seller?',
      answer: `Every signed-in user gets 2 free seller contacts per day, resetting at midnight IST. After that, each additional contact costs ₹9. Unlocking the same property again never charges you twice.`,
    },
  ];

  if (input.priceRange) {
    faqs.splice(1, 0, {
      question: `What is the price range in ${input.where}?`,
      answer: `Listings currently on this page range from ${input.priceRange}. Use the filters to narrow by budget, BHK, area and amenities.`,
    });
  }

  return faqs;
}
