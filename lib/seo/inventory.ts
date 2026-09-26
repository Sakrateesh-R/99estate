import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { landingTypeGroups, slugify } from '@/lib/seo/landing';
import type { Enums } from '@/types/database.types';

/**
 * §23 — how much real inventory sits behind a landing URL.
 *
 * The sitemap and the landing page used to answer "is this page worth having?"
 * separately, and they disagreed. The page checked its own result count and
 * emitted `noindex` when it was empty; the sitemap built a place × intent
 * cross-product from the locations catalog and listed the URL regardless. The
 * result on the live site was 186 landing URLs submitted for 3 listings — about
 * 95% of the sitemap was `noindex`, which is the one thing a sitemap must never
 * contain. On a new domain that spends the crawl budget discovering nothing and
 * fills Search Console with "Discovered – currently not indexed".
 *
 * So both now ask this module instead. One read of the published listings, one
 * count per URL shape, one threshold.
 */

/**
 * Minimum published listings before a landing page earns a place in the
 * sitemap.
 *
 * One, not zero — a page with a single genuine listing is a real answer to a
 * real search, and holding out for more would mean a new city is invisible
 * until it is already busy. Raise it if the index ever fills with thin pages;
 * that is a judgement about quality, which is why it is a named constant rather
 * than a literal buried in a filter.
 */
export const LANDING_MIN_LISTINGS = 1;

/** `citySlug|localitySlug|listingType|typeSlug` — '' for the absent parts. */
type BucketKey = string;

function bucketKey(input: {
  city: string;
  locality?: string | null;
  listing: Enums<'listing_type'>;
  typeSlug?: string | null;
}): BucketKey {
  return [
    slugify(input.city),
    input.locality ? slugify(input.locality) : '',
    input.listing,
    input.typeSlug ?? '',
  ].join('|');
}

/** Which landing type group, if any, a property type belongs to. */
function groupSlugsFor(type: Enums<'property_type'>): string[] {
  return landingTypeGroups()
    .filter((group) => group.types.includes(type))
    .map((group) => group.slug);
}

/**
 * Counts for every landing URL shape that has at least one listing.
 *
 * Absent keys mean zero, so a lookup miss is the same answer as a count of
 * nothing — callers never have to distinguish the two.
 */
export const landingInventory = cache(async (): Promise<Map<BucketKey, number>> => {
  const supabase = await createClient();

  const { data } = await supabase
    .from('properties')
    .select('city, locality, property_type, listing_type')
    .eq('status', 'published')
    // Matches the sitemap's own liveness rule: an expired listing is not
    // inventory, and counting it would re-introduce the empty pages this exists
    // to remove.
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .limit(20_000);

  const counts = new Map<BucketKey, number>();
  const bump = (key: BucketKey) => counts.set(key, (counts.get(key) ?? 0) + 1);

  for (const row of (data ?? []) as {
    city: string;
    locality: string | null;
    property_type: Enums<'property_type'>;
    listing_type: Enums<'listing_type'>;
  }[]) {
    if (!row.city) continue;

    const listing = row.listing_type;

    // Every listing counts towards the broad city page for its intent.
    bump(bucketKey({ city: row.city, listing }));

    // And towards the city page for its type group, where it has one.
    for (const slug of groupSlugsFor(row.property_type)) {
      bump(bucketKey({ city: row.city, listing, typeSlug: slug }));
    }

    if (row.locality) {
      bump(bucketKey({ city: row.city, locality: row.locality, listing }));
      for (const slug of groupSlugsFor(row.property_type)) {
        bump(bucketKey({ city: row.city, locality: row.locality, listing, typeSlug: slug }));
      }
    }
  }

  return counts;
});

export function landingListingCount(
  counts: Map<BucketKey, number>,
  input: {
    city: string;
    locality?: string | null;
    listing: Enums<'listing_type'>;
    typeSlug?: string | null;
  },
): number {
  return counts.get(bucketKey(input)) ?? 0;
}

/** Whether this landing URL has earned a place in the sitemap. */
export function landingIsWorthIndexing(
  counts: Map<BucketKey, number>,
  input: {
    city: string;
    locality?: string | null;
    listing: Enums<'listing_type'>;
    typeSlug?: string | null;
  },
): boolean {
  return landingListingCount(counts, input) >= LANDING_MIN_LISTINGS;
}
