import type { Enums } from '@/types/database.types';

/**
 * §23 — the URL grammar for the SEO landing pages.
 *
 * Search traffic for property arrives as a phrase: "flats for sale in
 * coimbatore", "plots in karur". `/properties?city=Coimbatore&listing=sale`
 * carries the same meaning but puts every keyword in a query string, which
 * ranks poorly and gives crawlers a combinatorial space to wander. These
 * pages put the phrase in the path instead, one stable URL per intent:
 *
 *   /property-for-sale-in-coimbatore
 *   /apartments-for-rent-in-coimbatore
 *   /property-for-sale-in-saravanampatti-coimbatore
 *   /pg-in-coimbatore
 *
 * Parsing is deliberately split in two. `parseLandingSlug` is pure and only
 * recognises the shape; resolving the place needs the locations table,
 * because "saravanampatti-coimbatore" cannot be split into locality and city
 * without knowing which cities exist.
 */

/**
 * Types that get their own landing pages.
 *
 * A curated subset on purpose. Every type × city × intent combination would
 * be thousands of pages, most with no inventory behind them — and a pile of
 * near-empty near-duplicates is actively harmful, not merely useless. These
 * are the ones people actually search by name.
 */
const TYPE_SLUGS: { slug: string; types: Enums<'property_type'>[]; label: string; plural: string }[] = [
  { slug: 'apartments', types: ['apartment'], label: 'Apartment', plural: 'Apartments' },
  {
    slug: 'independent-houses',
    types: ['independent_house'],
    label: 'Independent House',
    plural: 'Independent houses',
  },
  { slug: 'villas', types: ['villa'], label: 'Villa', plural: 'Villas' },
  // "Plot" is how people search; the schema splits residential from commercial.
  {
    slug: 'plots',
    types: ['residential_plot', 'commercial_plot'],
    label: 'Plot',
    plural: 'Plots',
  },
  {
    slug: 'office-spaces',
    types: ['office_space', 'co_working'],
    label: 'Office Space',
    plural: 'Office spaces',
  },
  { slug: 'shops', types: ['shop', 'showroom'], label: 'Shop', plural: 'Shops' },
];

export type LandingTypeGroup = (typeof TYPE_SLUGS)[number];

export function landingTypeGroups(): readonly LandingTypeGroup[] {
  return TYPE_SLUGS;
}

export type ParsedLandingSlug = {
  /** Null means "any property type" — the broadest page for that city. */
  typeGroup: LandingTypeGroup | null;
  listing: Enums<'listing_type'>;
  /** Still a slug: `coimbatore`, or `saravanampatti-coimbatore`. */
  placeSlug: string;
};

/** Lowercase, ASCII, hyphen-separated — the only thing that ever reaches a URL. */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    // Combining marks, left behind by NFKD once the base letter is separated.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Recognises the shape of a landing URL. Returns null for anything else, so
 * unknown paths fall through to a 404 rather than rendering an empty search.
 */
export function parseLandingSlug(slug: string): ParsedLandingSlug | null {
  const value = slug.toLowerCase();

  // PG is its own intent and reads wrong as "pg for rent in".
  const pg = /^pg-in-(.+)$/.exec(value);
  if (pg?.[1]) return { typeGroup: null, listing: 'pg', placeSlug: pg[1] };

  // The all-types page is matched first and explicitly. Folding it into the
  // typed pattern makes "property" look like a type slug, which then fails to
  // resolve and 404s the single most important page of the set.
  const all = /^property-for-(sale|rent)-in-(.+)$/.exec(value);
  if (all?.[2]) {
    return { typeGroup: null, listing: all[1] === 'rent' ? 'rent' : 'sale', placeSlug: all[2] };
  }

  const typed = /^([a-z0-9-]+?)-for-(sale|rent)-in-(.+)$/.exec(value);
  if (!typed?.[3]) return null;

  const typeGroup = TYPE_SLUGS.find((t) => t.slug === typed[1]);
  // A type we do not publish pages for is not a landing page. Falling back to
  // the all-types page would serve the same content on two URLs.
  if (!typeGroup) return null;

  return {
    typeGroup,
    listing: typed[2] === 'rent' ? 'rent' : 'sale',
    placeSlug: typed[3],
  };
}

/** Builds the canonical URL for a landing page. Inverse of `parseLandingSlug`. */
export function landingPath(input: {
  city: string;
  locality?: string | null;
  listing: Enums<'listing_type'>;
  typeSlug?: string | null;
}): string {
  const place = input.locality
    ? `${slugify(input.locality)}-${slugify(input.city)}`
    : slugify(input.city);

  if (input.listing === 'pg') return `/pg-in-${place}`;

  const intent = input.listing === 'rent' ? 'rent' : 'sale';
  const prefix = input.typeSlug ? `${input.typeSlug}-for` : 'property-for';

  return `/${prefix}-${intent}-in-${place}`;
}

/**
 * Human-readable heading for a landing page.
 *
 * Kept next to the URL builder so the H1 and the URL cannot drift — a page
 * titled "Apartments for rent" living at a `-for-sale-` URL is the kind of
 * mismatch that reads as spam.
 */
export function landingHeading(input: {
  typeGroup: LandingTypeGroup | null;
  listing: Enums<'listing_type'>;
  city: string;
  locality?: string | null;
}): string {
  const where = [input.locality, input.city].filter(Boolean).join(', ');
  const what = input.typeGroup ? input.typeGroup.plural : 'Property';

  if (input.listing === 'pg') return `PG and co-living in ${where}`;

  const intent = input.listing === 'rent' ? 'for rent' : 'for sale';
  return `${what} ${intent} in ${where}`;
}
