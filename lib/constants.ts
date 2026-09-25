import type { Enums } from '@/types/database.types';

/**
 * Human labels for every database enum, in one place, so the posting form,
 * the filters, the dashboard tables and the admin console never drift apart.
 */

/**
 * Post-sign-in destination is carried in an httpOnly cookie rather than a
 * `?next=` query parameter: the URL stays clean, the value cannot be edited by
 * the user, and it survives the round trip out to Google and back.
 *
 * `lax` same-site is what makes that round trip work — the return from the
 * OAuth provider is a top-level GET navigation.
 */
export const RETURN_TO_COOKIE = 'estate_return_to';
export const AUTH_ERROR_COOKIE = 'estate_auth_error';

/** Ten minutes is longer than any sign-in takes and short enough to be stale-safe. */
export const RETURN_TO_MAX_AGE = 600;
/** Errors are shown once, on the very next page load. */
export const AUTH_ERROR_MAX_AGE = 60;

/** Where a signed-in user lands when nothing better is remembered. */
export const DEFAULT_SIGNED_IN_PATH = '/dashboard';

export const SITE_NAME = '99Estate';
export const SITE_TAGLINE = 'Browse Properties Free. Get 2 Contacts Free Every Day. ₹9 After That.';

/**
 * Display-only mirrors of the server-side settings. The authoritative values
 * live in `app_settings` and are re-read by the database on every unlock —
 * these exist purely so static marketing copy can render without a query.
 */
export const FREE_DAILY_UNLOCKS = 2;
export const PAID_UNLOCK_PRICE = 9;
export const LISTING_DURATION_DAYS = 90;

export const PROPERTY_TYPE_LABELS: Record<Enums<'property_type'>, string> = {
  apartment: 'Apartment',
  independent_house: 'Independent House',
  villa: 'Villa',
  builder_floor: 'Builder Floor',
  penthouse: 'Penthouse',
  studio: 'Studio',
  farmhouse: 'Farmhouse',
  residential_plot: 'Residential Plot',
  office_space: 'Office Space',
  co_working: 'Co-working Space',
  shop: 'Shop',
  showroom: 'Showroom',
  warehouse: 'Warehouse',
  industrial_land: 'Industrial Land',
  commercial_plot: 'Commercial Plot',
  pg_hostel: 'PG / Hostel',
  agricultural_land: 'Agricultural Land',
};

/** Types where BHK / bathrooms / furnishing are meaningful inputs. */
export const RESIDENTIAL_TYPES: Enums<'property_type'>[] = [
  'apartment',
  'independent_house',
  'villa',
  'builder_floor',
  'penthouse',
  'studio',
  'farmhouse',
  'pg_hostel',
];

/** Types measured as land, where floors and furnishing make no sense. */
export const LAND_TYPES: Enums<'property_type'>[] = [
  'residential_plot',
  'commercial_plot',
  'industrial_land',
  'agricultural_land',
];

export const LISTING_TYPE_LABELS: Record<Enums<'listing_type'>, string> = {
  sale: 'Buy',
  rent: 'Rent',
  pg: 'PG / Co-living',
};

export const AREA_UNIT_LABELS: Record<Enums<'area_unit'>, string> = {
  sqft: 'sq.ft',
  sqm: 'sq.m',
  sqyd: 'sq.yd',
  acre: 'acre',
  hectare: 'hectare',
  cent: 'cent',
  guntha: 'guntha',
  bigha: 'bigha',
  marla: 'marla',
  kanal: 'kanal',
};

export const FURNISHING_LABELS: Record<Enums<'furnishing_status'>, string> = {
  unfurnished: 'Unfurnished',
  semi_furnished: 'Semi-furnished',
  fully_furnished: 'Fully furnished',
};

export const FACING_LABELS: Record<Enums<'facing_direction'>, string> = {
  north: 'North',
  south: 'South',
  east: 'East',
  west: 'West',
  north_east: 'North-East',
  north_west: 'North-West',
  south_east: 'South-East',
  south_west: 'South-West',
};

export const PROPERTY_STATUS_LABELS: Record<Enums<'property_status'>, string> = {
  draft: 'Draft',
  pending: 'Under review',
  published: 'Live',
  paused: 'Paused',
  sold: 'Sold',
  rented: 'Rented',
  expired: 'Expired',
  rejected: 'Needs changes',
};

export const VERIFICATION_LABELS: Record<Enums<'verification_status'>, string> = {
  unverified: 'Not verified',
  pending: 'Verification in review',
  verified: 'Verified',
  rejected: 'Verification declined',
};

export const LEAD_STATUS_LABELS: Record<Enums<'lead_status'>, string> = {
  new: 'New',
  contacted: 'Contacted',
  interested: 'Interested',
  site_visit: 'Site visit',
  negotiation: 'Negotiation',
  closed: 'Closed',
  not_interested: 'Not interested',
};

/** Pipeline order for the lead board. */
export const LEAD_STATUS_ORDER: Enums<'lead_status'>[] = [
  'new',
  'contacted',
  'interested',
  'site_visit',
  'negotiation',
  'closed',
  'not_interested',
];

export const REPORT_REASON_LABELS: Record<Enums<'report_reason'>, string> = {
  fake_property: 'Fake property',
  duplicate: 'Duplicate listing',
  wrong_price: 'Wrong price',
  sold_property: 'Already sold or rented',
  wrong_contact: 'Wrong contact details',
  fraud: 'Fraud',
  spam: 'Spam',
  misleading_information: 'Misleading information',
  other: 'Something else',
};

export const REPORT_STATUS_LABELS: Record<Enums<'report_status'>, string> = {
  open: 'Open',
  under_review: 'Under review',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
};

export const USER_ROLE_LABELS: Record<Enums<'user_role'>, string> = {
  buyer: 'Buyer',
  owner: 'Owner',
  agent: 'Agent',
  builder: 'Builder',
  admin: 'Admin',
};

/** How a seller is described on a public listing. */
export const SELLER_TYPE_LABELS: Record<Enums<'user_role'>, string> = {
  buyer: 'Owner',
  owner: 'Owner',
  agent: 'Agent',
  builder: 'Builder',
  admin: '99Estate',
};

export const BEDROOM_OPTIONS = [1, 2, 3, 4, 5] as const;

/**
 * Budget ladders, shared by the hero search and the header search so the two
 * cannot drift apart. Rungs are the round numbers people actually think in,
 * not an even mathematical split.
 */
export const SALE_BUDGETS = [
  { value: '2500000', label: 'Up to ₹25 L' },
  { value: '5000000', label: 'Up to ₹50 L' },
  { value: '7500000', label: 'Up to ₹75 L' },
  { value: '10000000', label: 'Up to ₹1 Cr' },
  { value: '20000000', label: 'Up to ₹2 Cr' },
  { value: '50000000', label: 'Up to ₹5 Cr' },
] as const;

export const RENT_BUDGETS = [
  { value: '10000', label: 'Up to ₹10,000' },
  { value: '20000', label: 'Up to ₹20,000' },
  { value: '35000', label: 'Up to ₹35,000' },
  { value: '50000', label: 'Up to ₹50,000' },
  { value: '100000', label: 'Up to ₹1,00,000' },
] as const;

/**
 * Params the header search form owns. Everything else in the URL is carried
 * forward as hidden inputs so a header search never wipes an existing filter
 * set. `page` is owned-and-omitted, which resets pagination to 1.
 *
 * `q` is deliberately NOT here: the header has no keyword field, so a typed
 * keyword must survive a header search.
 */
export const SEARCH_FORM_PARAMS = ['listing', 'city', 'type', 'max_price', 'page'] as const;

export const SORT_OPTIONS = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'newest', label: 'Newest first' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'area_asc', label: 'Area: low to high' },
  { value: 'area_desc', label: 'Area: high to low' },
] as const;

export type SortOption = (typeof SORT_OPTIONS)[number]['value'];

export const POSTED_WITHIN_OPTIONS = [
  { value: '1', label: 'Last 24 hours' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
] as const;

export const PAGE_SIZE = 24;
