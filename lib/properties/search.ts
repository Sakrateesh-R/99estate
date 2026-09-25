import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { PAGE_SIZE } from '@/lib/constants';
import { PROPERTY_CARD_COLUMNS, liveExpiryFilter, type PropertyCardData } from '@/lib/properties/queries';
import type { PropertyFilters } from '@/lib/properties/filters';

/**
 * §9 — server-side execution of a parsed filter set.
 *
 * Server-only: this module imports the cookie-bound Supabase client. The
 * filter *model* lives in `filters.ts` so the Client Component filter panel
 * can share it without dragging any of this into the browser bundle.
 */

export type SearchResult = {
  items: PropertyCardData[];
  total: number;
  page: number;
  pageCount: number;
};

/**
 * Wrapped in React `cache` so the results grid and the filter panel (which
 * needs the total for its "Show N properties" button) share one database
 * round trip. Both receive the same `filters` object, and `cache` keys on
 * argument identity.
 */
export const searchProperties = cache(async (filters: PropertyFilters): Promise<SearchResult> => {
  const supabase = await createClient();

  let query = supabase
    .from('properties')
    .select(PROPERTY_CARD_COLUMNS, { count: 'exact' })
    .eq('status', 'published')
    .or(liveExpiryFilter());

  if (filters.q) {
    // `websearch` gives users quoted phrases and `-exclusion` for free. The
    // 'simple' config matches the weighted title/locality/city lexemes in
    // properties.search_vector.
    query = query.textSearch('search_vector', filters.q, { type: 'websearch', config: 'simple' });
  }

  // ilike without wildcards is an exact, case-insensitive match.
  if (filters.city) query = query.ilike('city', filters.city);
  if (filters.locality) query = query.ilike('locality', `%${filters.locality}%`);
  if (filters.listing) query = query.eq('listing_type', filters.listing);
  if (filters.types.length) query = query.in('property_type', filters.types);

  if (filters.minPrice !== null) query = query.gte('price', filters.minPrice);
  if (filters.maxPrice !== null) query = query.lte('price', filters.maxPrice);
  if (filters.minArea !== null) query = query.gte('area_sqft', filters.minArea);
  if (filters.maxArea !== null) query = query.lte('area_sqft', filters.maxArea);

  if (filters.bhk.length) {
    // "5" on the UI means 5 BHK and above, so it cannot be a plain IN list.
    if (filters.bhk.includes(5)) {
      const exact = filters.bhk.filter((n) => n < 5);
      query = query.or(
        exact.length ? `bedrooms.in.(${exact.join(',')}),bedrooms.gte.5` : 'bedrooms.gte.5',
      );
    } else {
      query = query.in('bedrooms', filters.bhk);
    }
  }

  if (filters.minBathrooms !== null) query = query.gte('bathrooms', filters.minBathrooms);
  if (filters.furnishing.length) query = query.in('furnishing_status', filters.furnishing);
  if (filters.parking) query = query.gte('parking', 1);
  if (filters.facing.length) query = query.in('facing', filters.facing);
  if (filters.verifiedOnly) query = query.eq('verification_status', 'verified');
  if (filters.sellerTypes.length) query = query.in('seller_type', filters.sellerTypes);
  if (filters.featuredOnly) query = query.eq('is_featured', true);

  if (filters.postedWithinDays !== null) {
    const since = new Date(Date.now() - filters.postedWithinDays * 86_400_000).toISOString();
    query = query.gte('published_at', since);
  }

  switch (filters.sort) {
    case 'newest':
      query = query.order('published_at', { ascending: false, nullsFirst: false });
      break;
    case 'price_asc':
      query = query.order('price', { ascending: true });
      break;
    case 'price_desc':
      query = query.order('price', { ascending: false });
      break;
    case 'area_asc':
      query = query.order('area_sqft', { ascending: true, nullsFirst: false });
      break;
    case 'area_desc':
      query = query.order('area_sqft', { ascending: false, nullsFirst: false });
      break;
    default:
      // Relevance: promoted listings first, then verified ones, then recency.
      // The full-text predicate above has already narrowed the set; ranking by
      // ts_rank would need an RPC, which is not worth a round trip here.
      query = query
        .order('is_featured', { ascending: false })
        .order('verification_status', { ascending: true })
        .order('published_at', { ascending: false, nullsFirst: false });
  }

  // A stable tiebreaker keeps pagination from repeating or skipping rows when
  // many listings share the same sort value.
  query = query.order('id', { ascending: true });

  const from = (filters.page - 1) * PAGE_SIZE;
  const { data, count, error } = await query
    .range(from, from + PAGE_SIZE - 1)
    .returns<PropertyCardData[]>();

  if (error) {
    return { items: [], total: 0, page: filters.page, pageCount: 0 };
  }

  const total = count ?? 0;
  return {
    items: data ?? [],
    total,
    page: filters.page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
});
