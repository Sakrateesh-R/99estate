import { createClient } from '@/lib/supabase/server';
import type { Enums, Tables } from '@/types/database.types';

/**
 * Columns a property card needs — and nothing more.
 *
 * `cover_image_url` is denormalised onto `properties` by a trigger, so a grid
 * of 24 cards is one single-table read rather than a join that drags every
 * image row along with it (§25).
 *
 * Note what is absent: no seller phone number, no address, no email. Card and
 * list payloads must never carry contact data (§8).
 */
export const PROPERTY_CARD_COLUMNS = [
  'id',
  'slug',
  'title',
  'property_type',
  'listing_type',
  'price',
  'is_negotiable',
  'area',
  'area_unit',
  'bedrooms',
  'bathrooms',
  'furnishing_status',
  'facing',
  'city',
  'locality',
  'cover_image_url',
  'verification_status',
  'seller_type',
  'is_featured',
  'published_at',
  'created_at',
].join(', ');

export type PropertyCardData = Pick<
  Tables<'properties'>,
  | 'id'
  | 'slug'
  | 'title'
  | 'property_type'
  | 'listing_type'
  | 'price'
  | 'is_negotiable'
  | 'area'
  | 'area_unit'
  | 'bedrooms'
  | 'bathrooms'
  | 'furnishing_status'
  | 'facing'
  | 'city'
  | 'locality'
  | 'cover_image_url'
  | 'verification_status'
  | 'seller_type'
  | 'is_featured'
  | 'published_at'
  | 'created_at'
>;

/**
 * PostgREST filter for "live right now".
 *
 * RLS already hides unpublished listings from strangers, but a signed-in
 * seller can see their *own* drafts through the owner policy — so every
 * public-facing read states the live condition explicitly rather than relying
 * on the policy alone.
 */
export function liveExpiryFilter(): string {
  return `expires_at.is.null,expires_at.gt.${new Date().toISOString()}`;
}

export async function getFeaturedProperties(limit = 8): Promise<PropertyCardData[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('properties')
    .select(PROPERTY_CARD_COLUMNS)
    .eq('status', 'published')
    .or(liveExpiryFilter())
    .eq('is_featured', true)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit)
    .returns<PropertyCardData[]>();

  if (error) return [];
  return data ?? [];
}

export async function getLatestProperties(limit = 8): Promise<PropertyCardData[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('properties')
    .select(PROPERTY_CARD_COLUMNS)
    .eq('status', 'published')
    .or(liveExpiryFilter())
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit)
    .returns<PropertyCardData[]>();

  if (error) return [];
  return data ?? [];
}

export type UnlockedContact = { name: string | null; mobile: string };

export type CardMeta = {
  photoCounts: Map<string, number>;
  savedIds: Set<string>;
  /**
   * Seller contacts this viewer has already unlocked, keyed by property id.
   *
   * Without this a card cannot tell an unlocked listing from a locked one, so
   * it keeps offering "Unlock contact" for a property the user already paid
   * for — they only discover otherwise by opening it. Sourced from
   * `unlocked_seller_contacts`, which filters to settled unlocks owned by the
   * caller, so it cannot leak a number the viewer has not earned.
   */
  unlocked: Map<string, UnlockedContact>;
};

/**
 * Per-card extras for a page of results: how many photos each listing has,
 * and which ones the viewer has already saved.
 *
 * Two batched queries for the whole page rather than two per card — the
 * difference between 2 round trips and 48 (§25, avoid N+1). Photo rows are
 * counted in JS because PostgREST cannot GROUP BY, and at ≤15 images per
 * listing the payload stays small.
 */
export async function getCardMeta(propertyIds: string[]): Promise<CardMeta> {
  const empty: CardMeta = { photoCounts: new Map(), savedIds: new Set(), unlocked: new Map() };
  if (propertyIds.length === 0) return empty;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [images, saved, unlocks] = await Promise.all([
    supabase.from('property_images').select('property_id').in('property_id', propertyIds),
    user
      ? supabase
          .from('saved_properties')
          .select('property_id')
          .eq('user_id', user.id)
          .in('property_id', propertyIds)
      : Promise.resolve({ data: null }),
    user
      ? supabase
          .from('unlocked_seller_contacts')
          .select('property_id, seller_name, seller_mobile')
          .in('property_id', propertyIds)
      : Promise.resolve({ data: null }),
  ]);

  const photoCounts = new Map<string, number>();
  for (const row of images.data ?? []) {
    photoCounts.set(row.property_id, (photoCounts.get(row.property_id) ?? 0) + 1);
  }

  const unlocked = new Map<string, UnlockedContact>();
  for (const row of unlocks.data ?? []) {
    if (row.property_id && row.seller_mobile) {
      unlocked.set(row.property_id, { name: row.seller_name, mobile: row.seller_mobile });
    }
  }

  return {
    photoCounts,
    savedIds: new Set((saved.data ?? []).map((r) => r.property_id)),
    unlocked,
  };
}

export type PopularLocation = {
  city: string;
  state: string;
  listingCount: number;
};

/**
 * Cities for the "Popular Locations" rail. Curated in `locations` by admins
 * (§16) rather than derived from listing volume, so a brand-new marketplace
 * still shows the markets it wants to be known for.
 */
export async function getPopularLocations(limit = 12): Promise<PopularLocation[]> {
  const supabase = await createClient();

  const { data: locations } = await supabase
    .from('locations')
    .select('city, state')
    .is('locality', null)
    .eq('is_active', true)
    .eq('is_popular', true)
    .order('sort_order')
    .limit(limit);

  if (!locations?.length) return [];

  // One grouped count for the whole rail instead of a count per city.
  const { data: counts } = await supabase
    .from('properties')
    .select('city')
    .eq('status', 'published')
    .in(
      'city',
      locations.map((l) => l.city),
    );

  const tally = new Map<string, number>();
  for (const row of counts ?? []) {
    const key = row.city.toLowerCase();
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }

  return locations.map((l) => ({
    city: l.city,
    state: l.state,
    listingCount: tally.get(l.city.toLowerCase()) ?? 0,
  }));
}

export type BrowseCategory = {
  slug: string;
  label: string;
  icon: string | null;
  propertyTypes: Enums<'property_type'>[];
};

export async function getBrowseCategories(): Promise<BrowseCategory[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('property_categories')
    .select('slug, label, icon, property_types')
    .eq('is_active', true)
    .order('sort_order');

  return (data ?? []).map((row) => ({
    slug: row.slug,
    label: row.label,
    icon: row.icon,
    propertyTypes: row.property_types,
  }));
}

/** Cities offered by the hero search's location picker. */
export async function getActiveCities(): Promise<{ city: string; state: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('locations')
    .select('city, state')
    .is('locality', null)
    .eq('is_active', true)
    .order('sort_order')
    .limit(100);

  return data ?? [];
}
