import type { MetadataRoute } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getSiteUrl } from '@/lib/env';
import { propertyPath } from '@/lib/utils';

/** Sitemaps cap at 50,000 URLs; stay well inside it. */
const MAX_PROPERTY_URLS = 20_000;

export const revalidate = 3600;

/**
 * §23 — dynamic sitemap.
 *
 * Only published, unexpired listings are included: pointing a crawler at a
 * paused or expired listing wastes crawl budget and earns a soft 404.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/properties`, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${base}/properties?listing=sale`, changeFrequency: 'hourly', priority: 0.8 },
    { url: `${base}/properties?listing=rent`, changeFrequency: 'hourly', priority: 0.8 },
    { url: `${base}/properties?listing=pg`, changeFrequency: 'daily', priority: 0.6 },
    { url: `${base}/how-it-works`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/pricing`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${base}/about`, changeFrequency: 'yearly', priority: 0.4 },
  ];

  try {
    const supabase = await createClient();

    const [{ data: properties }, { data: cities }] = await Promise.all([
      supabase
        .from('properties')
        .select('id, slug, updated_at, published_at')
        .eq('status', 'published')
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(MAX_PROPERTY_URLS),
      supabase.from('locations').select('city').is('locality', null).eq('is_active', true).limit(500),
    ]);

    const cityEntries: MetadataRoute.Sitemap = (cities ?? []).map((c) => ({
      url: `${base}/properties?city=${encodeURIComponent(c.city)}`,
      changeFrequency: 'daily',
      priority: 0.7,
    }));

    const propertyEntries: MetadataRoute.Sitemap = (properties ?? []).map((p) => ({
      url: `${base}${propertyPath(p)}`,
      lastModified: new Date(p.updated_at),
      changeFrequency: 'weekly',
      priority: 0.7,
    }));

    return [...staticEntries, ...cityEntries, ...propertyEntries];
  } catch {
    // A database hiccup should degrade the sitemap, not break the route.
    return staticEntries;
  }
}
