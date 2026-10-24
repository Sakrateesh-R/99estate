import { landingPath, slugify } from '@/lib/seo/landing';
import {
  activeFilterCount,
  isIndexableSearch,
  parseFilters,
  type PropertyFilters,
} from '@/lib/properties/filters';
import type { ResolvedPlace } from '@/lib/seo/places';
import type { Enums } from '@/types/database.types';

/**
 * §23 — what `/properties?…` should say about itself: one canonical, and
 * whether it may be indexed.
 *
 * Three URL shapes come out of this route and each needs a different answer:
 *
 *   /properties                      the index. Self-canonical, indexable.
 *   /properties?city=X&listing=sale  a city search a landing page already
 *                                    answers at a URL built to rank. Canonical
 *                                    to that page, and *no* noindex.
 *   anything else                    a filter permutation. Canonical to
 *                                    /properties, noindex + follow.
 *
 * The middle case used to emit `noindex` *and* a canonical pointing at the
 * landing page. Those are contradictory instructions: the canonical asks a
 * crawler to consolidate this URL's signals onto the landing page, the noindex
 * asks it to drop the URL instead. The usual outcome is that the noindex wins
 * and the consolidation never happens — so the home page's "Popular locations"
 * links poured their value into a dead end — and the documented risk is worse,
 * the noindex being attributed across the canonical cluster to the very page it
 * was meant to promote. One mechanism per URL now: either a canonical that is
 * allowed to work, or a noindex. Never both pointing in different directions.
 *
 * Dropping the noindex is only safe if the canonical target is real and
 * equivalent, which is what `mapsToLanding` establishes. The old rule
 * established neither: the target was computed from the raw `?city=` string and
 * never checked, so it could point at a 404 (demonstrated — a city absent from
 * the catalog) or at a page emitting `noindex` (a city in the catalog with no
 * listings yet).
 *
 * Nothing here re-derives a rule that already exists. `isIndexableSearch`
 * decides what the index page is, `activeFilterCount` decides what counts as a
 * filter, `landingPath` builds the URL, `resolvePlace` and
 * `landingIsWorthIndexing` — injected, because they read the database — decide
 * whether the target deserves to exist. That last pair is the same predicate
 * the sitemap and the landing page already share, which is the point: three
 * places now answer "is this landing URL worth indexing" with one function
 * instead of three guesses.
 */

/** The question `landingIsWorthIndexing` answers, without its Supabase import. */
export type LandingIndexInput = {
  city: string;
  locality?: string | null;
  listing: Enums<'listing_type'>;
  typeSlug?: string | null;
};

export type SearchCanonicalDeps = {
  /**
   * The catalog entry for `filters.city`, or null when there is no landing page
   * for it. Resolved by the caller: `resolvePlace` reads the database and this
   * decision has to stay testable without one.
   */
  place: ResolvedPlace | null;
  /** `landingIsWorthIndexing`, bound to the request's inventory counts. */
  isWorthIndexing: (input: LandingIndexInput) => boolean;
};

export type SearchCanonical = {
  /** Site-relative path for `alternates.canonical`. */
  canonical: string;
  /** False means the route emits `noindex, follow`. */
  indexable: boolean;
};

/**
 * The filters a city landing page is equivalent to: that city, that listing
 * type, nothing else.
 *
 * Built by running the real parser rather than asserting a number, so "exactly
 * two filters" cannot quietly come to mean something else. `activeFilterCount`
 * is a UI badge count — if a future filter changes how it tallies, this
 * reference count changes with it and the comparison below still holds. A
 * literal `=== 2` would not.
 */
function cityAndListingOnly(filters: PropertyFilters): PropertyFilters {
  return parseFilters({ city: filters.city, listing: filters.listing ?? undefined });
}

/**
 * Does this search URL show exactly what the city landing page shows?
 *
 * A canonical is an assertion of equivalence, so every way the two could differ
 * has to be ruled out:
 *
 *   listing       required, and never defaulted. This is what the old rule got
 *                 wrong: it filled in `'sale'` when the parameter was absent,
 *                 so `?city=Coimbatore` — sale *and* rent *and* PG — claimed to
 *                 be the same page as the sale-only landing URL. A crawler
 *                 comparing them finds different listings and ignores the
 *                 canonical, which is the good case; the bad case is that it
 *                 believes it and the rent and PG inventory is represented by a
 *                 page that excludes it.
 *   locality      a locality has its own landing page, not this one.
 *   q, types      a city landing page carries no keyword and no type filter.
 *                 `landingPath` can address a type group, but mapping onto one
 *                 would have to match the whole group, not the single type this
 *                 URL may carry.
 *   page, sort    page one, default order — the landing page's own filters
 *                 (`filtersFor` in the landing route) use both.
 *   featuredOnly  a subset of the landing page, not a copy of it.
 *   filter count  equal to the count for city + listing alone, which is how
 *                 every *remaining* filter is excluded without restating the
 *                 list: price, area, BHK, bathrooms, furnishing, parking,
 *                 facing, verified, seller type and recency. Each of them would
 *                 make this URL a subset.
 *
 * `view` is deliberately not checked: list and grid return identical listings
 * in a different layout, so `?view=grid` really is the same page and a
 * canonical is exactly the right way to say so. (`isIndexableSearch` does
 * exclude grid, because it has no canonical to lean on — it decides whether a
 * URL is *the* original, not whether it duplicates a known one.)
 *
 * The place must resolve to a city-level catalog entry whose slug matches the
 * city asked for. That also normalises spelling: `?city=coimbatore` and
 * `?city=COIMBATORE` both canonical to the catalog's `Coimbatore` rather than
 * to two different URLs.
 */
function mapsToLanding(
  filters: PropertyFilters,
  { place, isWorthIndexing }: SearchCanonicalDeps,
): boolean {
  const { city, listing } = filters;
  if (!city || !listing) return false;
  if (filters.locality || filters.q || filters.types.length > 0) return false;
  if (filters.page !== 1 || filters.sort !== 'relevance' || filters.featuredOnly) return false;
  if (activeFilterCount(filters) !== activeFilterCount(cityAndListingOnly(filters))) return false;

  // A landing page exists for this place, it is a city rather than a locality,
  // and it is the city that was actually asked for.
  if (!place || place.locality !== null) return false;
  if (slugify(place.city) !== slugify(city)) return false;

  // And it has the inventory to be in the index at all. Without this the
  // canonical points at a page emitting `noindex`, which consolidates nothing
  // and leaves both URLs out of the index.
  return isWorthIndexing({ city: place.city, locality: null, listing, typeSlug: null });
}

export function searchCanonical(
  filters: PropertyFilters,
  deps: SearchCanonicalDeps,
): SearchCanonical {
  // The index itself.
  if (isIndexableSearch(filters)) return { canonical: '/properties', indexable: true };

  // A city search the landing page answers better. `place` and `listing` are
  // both non-null inside this branch — `mapsToLanding` returns false otherwise.
  if (mapsToLanding(filters, deps) && deps.place && filters.listing) {
    return {
      canonical: landingPath({ city: deps.place.city, listing: filters.listing }),
      indexable: true,
    };
  }

  // Every other permutation: disclaimed, but still walked through for listings.
  return { canonical: '/properties', indexable: false };
}
