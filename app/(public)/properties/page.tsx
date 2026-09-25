import { Suspense } from 'react';
import type { Metadata } from 'next';
import { SearchX } from 'lucide-react';
import { SearchFilters } from '@/components/property/search-filters';
import { PropertyCard } from '@/components/property/property-card';
import { PropertyListCard } from '@/components/property/property-list-card';
import { ResultToolbar } from '@/components/property/result-toolbar';
import { PropertyGridSkeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ButtonLink } from '@/components/ui/button';
import { Pagination } from '@/components/ui/pagination';
import { getActiveCities, getCardMeta } from '@/lib/properties/queries';
import {
  buildSearchParams,
  parseFilters,
  type PropertyFilters,
  type SearchParamsInput,
} from '@/lib/properties/filters';
import { searchProperties } from '@/lib/properties/search';
import { LISTING_TYPE_LABELS, PROPERTY_TYPE_LABELS, PAGE_SIZE } from '@/lib/constants';

type PageProps = { searchParams: Promise<SearchParamsInput> };

/**
 * §23 — a filtered search is a real page with its own title and description,
 * but only the unfiltered listing should be indexed. Otherwise the long tail of
 * filter permutations becomes thousands of near-duplicate URLs.
 */
export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const filters = parseFilters(await searchParams);

  const what = filters.types.length === 1 ? PROPERTY_TYPE_LABELS[filters.types[0]!] : 'Properties';
  const mode = filters.listing ? ` ${LISTING_TYPE_LABELS[filters.listing].toLowerCase()}` : '';
  const where = filters.city ? ` in ${filters.city}` : ' across India';

  const isCanonical = filters.page === 1 && !filters.q && !filters.locality;

  return {
    title: `${what}${mode ? ` to ${mode.trim()}` : ''}${where}`,
    description: `Browse ${what.toLowerCase()}${where} on 99Estate. Full details free, 2 seller contacts free every day, ₹9 after that.`,
    alternates: { canonical: `/properties${filters.city ? `?city=${encodeURIComponent(filters.city)}` : ''}` },
    robots: isCanonical ? undefined : { index: false, follow: true },
  };
}

export default async function PropertiesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const filters = parseFilters(params);
  const cities = await getActiveCities();

  return (
    <div className="container-page py-8 lg:py-10">
      <header>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {filters.city ? `Properties in ${filters.city}` : 'All properties'}
        </h1>
        <p className="mt-1.5 text-[0.9375rem] text-ink-600">
          Every listing is free to view in full. You only pay to unlock a seller&rsquo;s contact —
          and your first two each day are free.
        </p>
      </header>

      {/* SearchFilters owns the toolbar, the sidebar rail and the mobile
          sheet — they share state — and takes the results as children so they
          stay a Server Component and never reach the client bundle. */}
      <div className="mt-6">
        <SearchFilters filters={filters} cities={cities}>
          <Suspense
            key={JSON.stringify(params)}
            fallback={<PropertyGridSkeleton count={PAGE_SIZE / 4} />}
          >
            <Results filters={filters} />
          </Suspense>
        </SearchFilters>
      </div>
    </div>
  );
}

async function Results({ filters }: { filters: PropertyFilters }) {
  const { items, total, page, pageCount } = await searchProperties(filters);

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<SearchX className="size-6" />}
        title="No properties match these filters"
        description="Try widening your budget, clearing a filter or two, or searching a nearby locality."
        action={
          <>
            <ButtonLink href="/properties" variant="outline">
              Clear all filters
            </ButtonLink>
            <ButtonLink href="/dashboard/properties/new">Post a property</ButtonLink>
          </>
        }
      />
    );
  }

  // Photo counts and saved state for the whole page in two batched queries.
  const { photoCounts, savedIds, unlocked } = await getCardMeta(items.map((p) => p.id));

  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  return (
    <>
      <ResultToolbar filters={filters} total={total} from={from} to={to} />

      {filters.view === 'grid' ? (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
      ) : (
        <div className="mt-4 space-y-4">
          {items.map((property, index) => (
            <PropertyListCard
              key={property.id}
              property={property}
              priority={index < 2}
              isSaved={savedIds.has(property.id)}
              photoCount={photoCounts.get(property.id)}
              unlocked={unlocked.get(property.id)}
            />
          ))}
        </div>
      )}

      <Pagination
        className="mt-10"
        page={page}
        pageCount={pageCount}
        buildHref={(target) => {
          const qs = buildSearchParams({ ...filters, page: target }).toString();
          return qs ? `/properties?${qs}` : '/properties';
        }}
      />
    </>
  );
}
