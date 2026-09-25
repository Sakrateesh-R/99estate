import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { slugify } from '@/lib/seo/landing';

/**
 * §23 — resolves the place half of a landing URL against the catalog.
 *
 * `saravanampatti-coimbatore` cannot be split into locality and city by
 * looking at it: both parts are free text and either may contain a hyphen
 * once slugified ("r-s-puram"). So the slug is matched against the locations
 * table rather than parsed, which also means a URL for a place we do not
 * cover resolves to nothing and 404s — landing pages exist only where there
 * is a real catalog entry behind them.
 */

export type ResolvedPlace = {
  city: string;
  state: string;
  /** Null for a city-level page. */
  locality: string | null;
};

type PlaceRow = { city: string; state: string; locality: string | null };

/**
 * Every place that has a landing page, keyed by slug.
 *
 * Built from two sources, and it has to be both.
 *
 * The `locations` catalog is curated and drives the search filters, but it is
 * not what sellers are held to — `properties.locality` is free text, so a
 * listing can sit in a locality nobody added to the catalog. Building the
 * index from the catalog alone means the breadcrumb on such a listing links
 * to a 404, and a site that links to its own 404s is a site crawlers learn to
 * distrust.
 *
 * Published listings are therefore the second source, which also gives the
 * set a useful property: a locality page exists exactly when there is
 * something to show on it. No empty pages, no dead links.
 */
const placeIndex = cache(async (): Promise<Map<string, ResolvedPlace>> => {
  const supabase = await createClient();

  const [{ data: catalog }, { data: listed }] = await Promise.all([
    supabase.from('locations').select('city, state, locality').eq('is_active', true).limit(5000),
    // Distinct would be better than dedup-in-memory, but PostgREST has no
    // DISTINCT and this is cached per request behind an hourly revalidate.
    // Revisit with a view if the listing count ever makes the payload matter.
    supabase
      .from('properties')
      .select('city, state, locality')
      .eq('status', 'published')
      .limit(20_000),
  ]);

  const index = new Map<string, ResolvedPlace>();

  const add = (row: PlaceRow) => {
    if (!row.city) return;
    const citySlug = slugify(row.city);
    if (!citySlug) return;

    if (!index.has(citySlug)) {
      index.set(citySlug, { city: row.city, state: row.state, locality: null });
    }

    if (!row.locality) return;
    const localitySlug = slugify(row.locality);
    if (!localitySlug) return;

    const key = `${localitySlug}-${citySlug}`;
    if (!index.has(key)) {
      index.set(key, { city: row.city, state: row.state, locality: row.locality });
    }
  };

  // Catalog first so its capitalisation wins over whatever a seller typed.
  for (const row of (catalog ?? []) as PlaceRow[]) add(row);
  for (const row of (listed ?? []) as PlaceRow[]) add(row);

  return index;
});

export async function resolvePlace(placeSlug: string): Promise<ResolvedPlace | null> {
  return (await placeIndex()).get(placeSlug.toLowerCase()) ?? null;
}

/** Every place with a landing page — the sitemap's source of truth. */
export const landingPlaces = cache(async (): Promise<ResolvedPlace[]> => {
  const index = await placeIndex();
  return [...index.values()].sort(
    (a, b) => a.city.localeCompare(b.city) || (a.locality ?? '').localeCompare(b.locality ?? ''),
  );
});

/** Cities that have landing pages — drives internal linking. */
export const landingCities = cache(async (): Promise<ResolvedPlace[]> => {
  return (await landingPlaces()).filter((p) => p.locality === null);
});

/** Localities inside one city, for the "popular localities" links on a city page. */
export const localitiesIn = cache(async (city: string): Promise<ResolvedPlace[]> => {
  const index = await placeIndex();
  const want = slugify(city);
  return [...index.values()]
    .filter((p) => p.locality !== null && slugify(p.city) === want)
    .sort((a, b) => (a.locality ?? '').localeCompare(b.locality ?? ''));
});
