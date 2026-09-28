import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { getUser } from '@/lib/auth/session';
import type { Enums } from '@/types/database.types';

/**
 * §14 — the contacts a buyer has unlocked.
 *
 * This is the other half of the ₹9. A buyer spends a free unlock or pays, gets
 * the seller's number, and then closes the tab — and until this existed there
 * was nowhere to find it again. `unlocked_seller_contacts` has held the data
 * since the schema went in and nothing read it.
 *
 * Every read goes through that view, never `profiles`, because the column it
 * exposes is the one the entire paywall exists to protect.
 *
 * Its WHERE clause used to end `or public.is_admin()`, which made an unfiltered
 * read return every buyer's purchased contacts to an admin — including on this
 * page. Migration 019 removes that, and the reads below name the buyer anyway.
 * Two independent answers to "is this yours?" is the right number for a phone
 * number somebody paid for.
 */

export type UnlockedContactRow = {
  contactUnlockId: string;
  propertyId: string;
  sellerName: string | null;
  sellerMobile: string | null;
  sellerAvatar: string | null;
  sellerType: Enums<'user_role'> | null;
  isFree: boolean;
  amount: number;
  unlockedAt: string;
  /** Null when the listing has since been deleted. */
  property: {
    title: string;
    slug: string | null;
    city: string;
    locality: string | null;
    price: number;
    listingType: Enums<'listing_type'>;
    status: Enums<'property_status'>;
    coverImageUrl: string | null;
  } | null;
};

export const getUnlockedContacts = cache(async (): Promise<UnlockedContactRow[]> => {
  const supabase = await createClient();

  const user = await getUser();
  if (!user) return [];

  const { data } = await supabase
    .from('unlocked_seller_contacts')
    .select(
      'contact_unlock_id, property_id, seller_name, seller_mobile, seller_avatar, seller_type, is_free, amount, unlocked_at',
    )
    // Belt and braces. The view pins itself to auth.uid() as of migration 019,
    // but it used to add `or is_admin()`, and that is precisely the sort of
    // clause that gets re-added by someone solving a different problem. Saying
    // whose contacts these are at the call site means this page cannot widen
    // again without the change being visible right here.
    .eq('buyer_id', user.id)
    .order('unlocked_at', { ascending: false })
    .limit(200);

  const rows = (data ?? []) as {
    contact_unlock_id: string | null;
    property_id: string | null;
    seller_name: string | null;
    seller_mobile: string | null;
    seller_avatar: string | null;
    seller_type: Enums<'user_role'> | null;
    is_free: boolean | null;
    amount: number | null;
    unlocked_at: string | null;
  }[];

  if (rows.length === 0) return [];

  const propertyIds = [...new Set(rows.map((r) => r.property_id).filter((id): id is string => Boolean(id)))];

  /**
   * A second read rather than a join, because the listing may be gone.
   *
   * An unlock outlives the listing it was bought for — deleted, expired or
   * taken down — and the buyer still paid for that number. Fetching separately
   * means a missing listing leaves the contact intact instead of dropping the
   * whole row.
   */
  const { data: properties } = await supabase
    .from('properties')
    .select('id, title, slug, city, locality, price, listing_type, status, cover_image_url')
    .in('id', propertyIds);

  const byId = new Map(
    (properties ?? []).map((p) => [
      p.id,
      {
        title: p.title,
        slug: p.slug,
        city: p.city,
        locality: p.locality,
        price: p.price,
        listingType: p.listing_type,
        status: p.status,
        coverImageUrl: p.cover_image_url,
      },
    ]),
  );

  return rows
    .filter((r) => r.contact_unlock_id && r.property_id)
    .map((r) => ({
      contactUnlockId: r.contact_unlock_id!,
      propertyId: r.property_id!,
      sellerName: r.seller_name,
      sellerMobile: r.seller_mobile,
      sellerAvatar: r.seller_avatar,
      sellerType: r.seller_type,
      isFree: r.is_free ?? true,
      amount: Number(r.amount ?? 0),
      unlockedAt: r.unlocked_at ?? new Date(0).toISOString(),
      property: byId.get(r.property_id!) ?? null,
    }));
});

/**
 * Just how many, for the dashboard's entry point into the full list.
 *
 * A count rather than `getUnlockedContacts().length`, because the overview only
 * needs the number and that function also reads every listing behind them.
 */
export const countUnlockedContacts = cache(async (): Promise<number> => {
  const supabase = await createClient();

  const user = await getUser();
  if (!user) return 0;

  const { count } = await supabase
    .from('unlocked_seller_contacts')
    .select('contact_unlock_id', { count: 'exact', head: true })
    .eq('buyer_id', user.id);

  return count ?? 0;
});

export type UnlockedSummary = {
  total: number;
  paid: number;
  spent: number;
};

export function summariseUnlocked(rows: UnlockedContactRow[]): UnlockedSummary {
  return rows.reduce<UnlockedSummary>(
    (acc, row) => {
      acc.total += 1;
      if (!row.isFree) {
        acc.paid += 1;
        acc.spent += row.amount;
      }
      return acc;
    },
    { total: 0, paid: 0, spent: 0 },
  );
}
