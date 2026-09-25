import type { SortOption } from '@/lib/constants';
import type { Enums } from '@/types/database.types';

/**
 * Pure filter model for §9 — parsing, serialising and counting only.
 *
 * Deliberately free of any Supabase import: the filter panel is a Client
 * Component, and anything it touches ends up in the browser bundle. The query
 * execution lives in `search.ts`, which is server-only.
 */

export type PropertyFilters = {
  q: string;
  city: string;
  locality: string;
  listing: Enums<'listing_type'> | null;
  types: Enums<'property_type'>[];
  minPrice: number | null;
  maxPrice: number | null;
  minArea: number | null;
  maxArea: number | null;
  /** 5 means "5 or more". */
  bhk: number[];
  minBathrooms: number | null;
  furnishing: Enums<'furnishing_status'>[];
  parking: boolean;
  facing: Enums<'facing_direction'>[];
  verifiedOnly: boolean;
  sellerTypes: Enums<'user_role'>[];
  postedWithinDays: number | null;
  featuredOnly: boolean;
  sort: SortOption;
  page: number;
  /** Result layout. List is the default: filtered results are for comparing. */
  view: 'list' | 'grid';
};

export type SearchParamsInput = Record<string, string | string[] | undefined>;

const LISTING_TYPES = ['sale', 'rent', 'pg'] as const;
const PROPERTY_TYPES = [
  'apartment', 'independent_house', 'villa', 'builder_floor', 'penthouse', 'studio', 'farmhouse',
  'residential_plot', 'office_space', 'co_working', 'shop', 'showroom', 'warehouse',
  'industrial_land', 'commercial_plot', 'pg_hostel', 'agricultural_land',
] as const;
const FURNISHINGS = ['unfurnished', 'semi_furnished', 'fully_furnished'] as const;
const FACINGS = ['north', 'south', 'east', 'west', 'north_east', 'north_west', 'south_east', 'south_west'] as const;
const SELLER_TYPES = ['owner', 'agent', 'builder'] as const;
const SORTS = ['relevance', 'newest', 'price_asc', 'price_desc', 'area_asc', 'area_desc'] as const;

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

/** Accepts both `?type=a&type=b` and `?type=a,b`. */
function list(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  return raw.flatMap((v) => v.split(',')).map((v) => v.trim()).filter(Boolean);
}

function keepKnown<T extends readonly string[]>(values: string[], allowed: T): T[number][] {
  return values.filter((v): v is T[number] => (allowed as readonly string[]).includes(v));
}

function positiveInt(value: string): number | null {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Query strings are attacker-controlled. Anything unrecognised is dropped
 * rather than passed through to PostgREST.
 */
export function parseFilters(params: SearchParamsInput): PropertyFilters {
  const listing = first(params.listing);
  const sort = first(params.sort);
  const page = Number.parseInt(first(params.page) || '1', 10);

  return {
    q: first(params.q).trim().slice(0, 120),
    city: first(params.city).trim().slice(0, 80),
    locality: first(params.locality).trim().slice(0, 120),
    listing: (LISTING_TYPES as readonly string[]).includes(listing)
      ? (listing as Enums<'listing_type'>)
      : null,
    types: keepKnown(list(params.type), PROPERTY_TYPES),
    minPrice: positiveInt(first(params.min_price)),
    maxPrice: positiveInt(first(params.max_price)),
    minArea: positiveInt(first(params.min_area)),
    maxArea: positiveInt(first(params.max_area)),
    bhk: list(params.bhk)
      .map((v) => Number.parseInt(v, 10))
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= 5),
    minBathrooms: positiveInt(first(params.bath)),
    furnishing: keepKnown(list(params.furnishing), FURNISHINGS),
    parking: first(params.parking) === '1',
    facing: keepKnown(list(params.facing), FACINGS),
    verifiedOnly: first(params.verified) === '1',
    sellerTypes: keepKnown(list(params.seller), SELLER_TYPES),
    postedWithinDays: positiveInt(first(params.posted)),
    featuredOnly: first(params.featured) === '1',
    sort: (SORTS as readonly string[]).includes(sort) ? (sort as SortOption) : 'relevance',
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 400) : 1,
    view: first(params.view) === 'grid' ? 'grid' : 'list',
  };
}

/** Rebuilds a canonical query string — used by the filter UI and pagination. */
export function buildSearchParams(filters: Partial<PropertyFilters>): URLSearchParams {
  const p = new URLSearchParams();
  const put = (key: string, value: string | number | null | undefined) => {
    if (value === null || value === undefined || value === '') return;
    p.set(key, String(value));
  };

  put('q', filters.q);
  put('city', filters.city);
  put('locality', filters.locality);
  put('listing', filters.listing ?? undefined);
  if (filters.types?.length) put('type', filters.types.join(','));
  put('min_price', filters.minPrice);
  put('max_price', filters.maxPrice);
  put('min_area', filters.minArea);
  put('max_area', filters.maxArea);
  if (filters.bhk?.length) put('bhk', filters.bhk.join(','));
  put('bath', filters.minBathrooms);
  if (filters.furnishing?.length) put('furnishing', filters.furnishing.join(','));
  if (filters.parking) put('parking', '1');
  if (filters.facing?.length) put('facing', filters.facing.join(','));
  if (filters.verifiedOnly) put('verified', '1');
  if (filters.sellerTypes?.length) put('seller', filters.sellerTypes.join(','));
  put('posted', filters.postedWithinDays);
  if (filters.featuredOnly) put('featured', '1');
  if (filters.sort && filters.sort !== 'relevance') put('sort', filters.sort);
  if (filters.view === 'grid') put('view', 'grid');
  if (filters.page && filters.page > 1) put('page', filters.page);

  return p;
}

/** How many filters are active — drives the "Filters (3)" badge and Clear all. */
export function activeFilterCount(filters: PropertyFilters): number {
  let n = 0;
  if (filters.q) n++;
  if (filters.city) n++;
  if (filters.locality) n++;
  if (filters.listing) n++;
  if (filters.types.length) n++;
  if (filters.minPrice !== null || filters.maxPrice !== null) n++;
  if (filters.minArea !== null || filters.maxArea !== null) n++;
  if (filters.bhk.length) n++;
  if (filters.minBathrooms !== null) n++;
  if (filters.furnishing.length) n++;
  if (filters.parking) n++;
  if (filters.facing.length) n++;
  if (filters.verifiedOnly) n++;
  if (filters.sellerTypes.length) n++;
  if (filters.postedWithinDays !== null) n++;
  return n;
}
