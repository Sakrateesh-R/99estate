import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { Enums } from '@/types/database.types';

/**
 * §14 — the contacts a buyer has unlocked.
 *
 * This is the other half of the ₹9. A buyer spends a free unlock or pays, gets
 * the seller's number, and then closes the tab — and until this existed there
 * was nowhere to find it again. `unlocked_seller_contacts` has held the data
 * since the schema went in and nothing read it.
 *
 * Every read goes through that view, never `profiles`. It pins itself to
 * `cu.user_id = auth.uid()` in its own WHERE clause, so a query here cannot
 * widen to somebody else's unlocks whatever it passes — which matters, because
 * the column it exposes is the one the entire paywall exists to protect.
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

  const { data } = await supabase
    .from('unlocked_seller_contacts')
    .select(
      'contact_unlock_id, property_id, seller_name, seller_mobile, seller_avatar, seller_type, is_free, amount, unlocked_at',
    )
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
