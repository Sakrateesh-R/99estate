import type { MetadataRoute } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getSiteUrl } from '@/lib/env';
import { propertyPath } from '@/lib/utils';
import { landingPath, landingTypeGroups } from '@/lib/seo/landing';
import { landingInventory, landingIsWorthIndexing } from '@/lib/seo/inventory';
import { landingPlaces } from '@/lib/seo/places';
import type { Enums } from '@/types/database.types';

/** Sitemaps cap at 50,000 URLs; stay well inside it. */
const MAX_PROPERTY_URLS = 20_000;
const MAX_PROJECT_URLS = 5_000;
const MAX_BUILDER_URLS = 2_000;

const LISTING_TYPES: Enums<'listing_type'>[] = ['sale', 'rent', 'pg'];

export const revalidate = 3600;

/**
 * §23 — dynamic sitemap.
 *
 * Only published, unexpired listings are included: pointing a crawler at a
 * paused or expired listing wastes crawl budget and earns a soft 404.
 *
 * The city and intent URLs here are the landing pages, not `?city=` query
 * strings. Those were the same content behind a URL shape that does not rank,
 * and advertising both would have split the signal across two addresses for
 * every city we cover.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/properties`, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${base}/projects`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${base}/how-it-works`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/pricing`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/about`, changeFrequency: 'yearly', priority: 0.4 },
    // Google's OAuth verification requires a reachable, indexable privacy policy.
    { url: `${base}/terms`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
  ];

  try {
    const supabase = await createClient();

    // The same index the landing routes resolve against, so the sitemap can
    // never advertise a URL that 404s — the two would otherwise drift apart
    // the moment a seller used a locality nobody had added to the catalog.
    const [{ data: properties }, { data: projects }, { data: builders }, places, inventory] =
      await Promise.all([
        supabase
          .from('properties')
          .select('id, slug, public_code, updated_at, published_at')
          .eq('status', 'published')
          .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
          .order('published_at', { ascending: false, nullsFirst: false })
          .limit(MAX_PROPERTY_URLS),
        /**
         * No expiry filter, deliberately. §18 keeps a completed, sold-out
         * project public as the builder's track record, so unlike a listing
         * there is no stale project to keep out of the index. RLS already
         * restricts this to published, unsuspended ones.
         */
        supabase
          .from('projects')
          .select('slug, updated_at, organization_id')
          .order('published_at', { ascending: false, nullsFirst: false })
          .limit(MAX_PROJECT_URLS),
        /**
         * Every company, narrowed below to the ones with a published project.
         *
         * Not `.gt('projects_count', 0)`, which was the first attempt and was
         * wrong: that counter includes drafts, so a builder whose every project
         * is unpublished would have been advertised here while their own page
         * emits `noindex` — the same contradiction the landing pages were fixed
         * for. The published projects are already being fetched, so the set of
         * companies worth listing is derivable from them and cannot disagree.
         */
        supabase.from('builder_public_profiles').select('id, slug').limit(MAX_BUILDER_URLS),
        landingPlaces(),
        landingInventory(),
      ]);

    const cityRows = places.filter((p) => p.locality === null);
    const localityRows = places.filter((p) => p.locality !== null);

    /**
     * Only URLs with listings behind them.
     *
     * Every landing page already emits `noindex` when it has no results, so
     * listing them here advertised pages the site itself asks not to index —
     * 186 of 196 URLs on the live sitemap, for 3 listings. A sitemap is a set
     * of recommendations, and recommending a `noindex` page is a contradiction
     * that costs crawl budget and shows up as "Discovered – currently not
     * indexed". `landingInventory` is the same count the page decides on, so
     * the two can no longer disagree.
     */
    const cityEntries: MetadataRoute.Sitemap = cityRows.flatMap((c) =>
      LISTING_TYPES.flatMap((listing) => [
        ...(landingIsWorthIndexing(inventory, { city: c.city, listing })
          ? [
              {
                url: `${base}${landingPath({ city: c.city, listing })}`,
                changeFrequency: 'daily' as const,
                // The broad city page is the strongest of the set and should be
                // crawled ahead of the type splits beneath it.
                priority: 0.8,
              },
            ]
          : []),
        // PG has no property-type breakdown worth publishing.
        ...(listing === 'pg'
          ? []
          : landingTypeGroups()
              .filter((group) =>
                landingIsWorthIndexing(inventory, { city: c.city, listing, typeSlug: group.slug }),
              )
              .map((group) => ({
                url: `${base}${landingPath({ city: c.city, listing, typeSlug: group.slug })}`,
                changeFrequency: 'daily' as const,
                priority: 0.6,
              }))),
      ]),
    );

    // Localities only get the broad intents. Multiplying them by property type
    // produces mostly-empty pages, and an empty page in a sitemap spends crawl
    // budget to find nothing.
    const localityEntries: MetadataRoute.Sitemap = localityRows.flatMap((l) =>
      LISTING_TYPES.filter((listing) =>
        landingIsWorthIndexing(inventory, { city: l.city, locality: l.locality, listing }),
      ).map((listing) => ({
        url: `${base}${landingPath({ city: l.city, locality: l.locality, listing })}`,
        changeFrequency: 'daily' as const,
        priority: 0.6,
      })),
    );

    const propertyEntries: MetadataRoute.Sitemap = (properties ?? []).map((p) => ({
      url: `${base}${propertyPath(p)}`,
      lastModified: new Date(p.updated_at),
      changeFrequency: 'weekly',
      priority: 0.7,
    }));

    const projectEntries: MetadataRoute.Sitemap = (projects ?? []).map((p) => ({
      url: `${base}/projects/${p.slug}`,
      lastModified: new Date(p.updated_at),
      changeFrequency: 'weekly',
      priority: 0.7,
    }));

    // The companies that actually have a page worth crawling.
    const orgsWithLiveProjects = new Set((projects ?? []).map((p) => p.organization_id));

    const builderEntries: MetadataRoute.Sitemap = (builders ?? [])
      .filter((b) => b.slug && b.id && orgsWithLiveProjects.has(b.id))
      .map((b) => ({
        url: `${base}/builders/${b.slug}`,
        changeFrequency: 'weekly',
        priority: 0.5,
      }));

    return [
      ...staticEntries,
      ...cityEntries,
      ...localityEntries,
      ...propertyEntries,
      ...projectEntries,
      ...builderEntries,
    ];
  } catch {
    // A database hiccup should degrade the sitemap, not break the route.
    return staticEntries;
  }
}
