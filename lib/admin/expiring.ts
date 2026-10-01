import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { Enums } from '@/types/database.types';

/**
 * §18 — listings approaching the end of their 90 days.
 *
 * This exists because of who owns them. 34 of 36 listings here belong to
 * placeholder accounts created when an admin posted on a walk-in owner's
 * behalf: no usable email, no way to sign in, no way to renew. The seller-side
 * renewal button is real and, for most of this inventory, unreachable.
 *
 * It is also concentrated. Thirty listings expire between 25 and 28 December
 * 2026, which is a day of clicking one at a time, or one action here.
 *
 * The default window is a full listing cycle rather than a fortnight. A page
 * that only fills up once the cliff is a week away is no use for planning —
 * the point is to see it coming while there is still time to decide.
 */

export type ExpiringListing = {
  id: string;
  title: string;
  slug: string | null;
  publicCode: string | null;
  city: string;
  locality: string | null;
  price: number;
  listingType: Enums<'listing_type'>;
  status: Enums<'property_status'>;
  expiresAt: string;
  daysLeft: number;
  ownerName: string | null;
  /** False when the owner is a placeholder and cannot renew it themselves. */
  ownerCanSignIn: boolean;
  postedOnBehalf: boolean;
};

const DAY = 24 * 60 * 60 * 1000;

export const getExpiringListings = cache(async (withinDays = 90): Promise<ExpiringListing[]> => {
  const supabase = await createClient();

  const horizon = new Date(Date.now() + withinDays * DAY).toISOString();

  const { data } = await supabase
    .from('properties')
    .select(
      'id, title, slug, public_code, city, locality, price, listing_type, status, expires_at, seller_id, posted_by',
    )
    .eq('status', 'published')
    .not('expires_at', 'is', null)
    .lte('expires_at', horizon)
    .order('expires_at')
    .limit(500);

  const rows = data ?? [];
  if (rows.length === 0) return [];

  const sellerIds = [...new Set(rows.map((r) => r.seller_id))];
  const { data: owners } = await supabase
    .from('profiles')
    .select('id, full_name, is_placeholder')
    .in('id', sellerIds);

  const byId = new Map((owners ?? []).map((o) => [o.id, o]));
  const now = Date.now();

  return rows.map((row) => {
    const owner = byId.get(row.seller_id);
    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      publicCode: row.public_code,
      city: row.city,
      locality: row.locality,
      price: row.price,
      listingType: row.listing_type,
      status: row.status,
      expiresAt: row.expires_at!,
      // Rounded up: a listing with six hours left has "1 day", not "0".
      daysLeft: Math.max(0, Math.ceil((new Date(row.expires_at!).getTime() - now) / DAY)),
      ownerName: owner?.full_name ?? null,
      ownerCanSignIn: !(owner?.is_placeholder ?? false),
      postedOnBehalf: row.posted_by !== null && row.posted_by !== row.seller_id,
    };
  });
});

/** Just the count, for the nav badge. */
export const countExpiringSoon = cache(async (withinDays = 90): Promise<number> => {
  const supabase = await createClient();

  const { count } = await supabase
    .from('properties')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'published')
    .not('expires_at', 'is', null)
    .lte('expires_at', new Date(Date.now() + withinDays * DAY).toISOString());

  return count ?? 0;
});
