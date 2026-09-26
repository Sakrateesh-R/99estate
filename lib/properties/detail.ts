import { cache } from 'react';
import { createHash } from 'node:crypto';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import type { Enums, Tables } from '@/types/database.types';

/**
 * Columns safe to render on a public property page.
 *
 * `address` is intentionally excluded (§8 — the exact door number is part of
 * what a buyer unlocks) and no seller contact column appears anywhere.
 */
const DETAIL_COLUMNS = [
  'id', 'slug', 'seller_id', 'title', 'description',
  'property_type', 'listing_type', 'price', 'is_negotiable',
  'area', 'area_unit', 'area_sqft',
  'bedrooms', 'bathrooms', 'balconies', 'floor_number', 'total_floors',
  'property_age', 'furnishing_status', 'parking', 'facing',
  'country', 'state', 'city', 'locality', 'pincode', 'latitude', 'longitude',
  'status', 'verification_status', 'seller_type', 'is_featured',
  'published_at', 'expires_at', 'views_count', 'saves_count',
  'cover_image_url', 'video_url', 'created_at', 'updated_at',
].join(', ');

/**
 * `posted_by` is omitted as well as unselected. It is internal provenance —
 * which admin typed a listing in on a seller's behalf — and has no business on
 * a page anybody can read.
 *
 * Both lists have to agree, because `.maybeSingle<PropertyDetail>()` asserts
 * this shape rather than deriving it: a column named here but missing from
 * DETAIL_COLUMNS arrives as `undefined` while TypeScript insists it is there.
 */
export type PropertyDetail = Omit<
  Tables<'properties'>,
  'address' | 'rejection_reason' | 'last_renewed_at' | 'unlocks_count' | 'leads_count' | 'posted_by'
>;

export type PropertyImage = {
  id: string;
  publicUrl: string;
  isCover: boolean;
  width: number | null;
  height: number | null;
};

export type PublicSeller = {
  id: string;
  name: string | null;
  avatarUrl: string | null;
  sellerType: Enums<'user_role'>;
  memberSince: string | null;
};

export type PropertyDetailData = {
  property: PropertyDetail;
  images: PropertyImage[];
  amenities: string[];
  seller: PublicSeller | null;
  isSaved: boolean;
  isOwnListing: boolean;
};

/**
 * Everything the public property page needs, in three parallel reads.
 *
 * Wrapped in `cache` because `generateMetadata` and the page component both
 * need it, and Next runs them separately.
 */
export const getPropertyDetail = cache(async (propertyId: string): Promise<PropertyDetailData | null> => {
  const supabase = await createClient();

  const { data: property } = await supabase
    .from('properties')
    .select(DETAIL_COLUMNS)
    .eq('id', propertyId)
    .maybeSingle<PropertyDetail>();

  // RLS has already decided visibility: a stranger simply gets nothing back
  // for a draft or expired listing, while the owner and admins still see it.
  if (!property) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [images, amenities, seller, saved] = await Promise.all([
    supabase
      .from('property_images')
      .select('id, public_url, is_cover, width, height')
      .eq('property_id', propertyId)
      .order('is_cover', { ascending: false })
      .order('sort_order')
      .order('created_at'),
    supabase.from('property_amenities').select('amenity_name').eq('property_id', propertyId),
    supabase
      .from('seller_public_profiles')
      .select('id, full_name, avatar_url, seller_type, member_since')
      .eq('id', property.seller_id)
      .maybeSingle(),
    user
      ? supabase
          .from('saved_properties')
          .select('id')
          .eq('user_id', user.id)
          .eq('property_id', propertyId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    property,
    images: (images.data ?? []).map((i) => ({
      id: i.id,
      publicUrl: i.public_url,
      isCover: i.is_cover,
      width: i.width,
      height: i.height,
    })),
    amenities: (amenities.data ?? []).map((a) => a.amenity_name),
    seller: seller.data?.id
      ? {
          id: seller.data.id,
          name: seller.data.full_name,
          avatarUrl: seller.data.avatar_url,
          sellerType: seller.data.seller_type ?? 'owner',
          memberSince: seller.data.member_since,
        }
      : null,
    isSaved: Boolean(saved.data),
    isOwnListing: user?.id === property.seller_id,
  };
});

/**
 * Street address, revealed only once the buyer holds a settled unlock.
 * Kept out of `getPropertyDetail` so it can never be serialised into the
 * public page payload by accident.
 */
export async function getUnlockedAddress(propertyId: string): Promise<string | null> {
  const supabase = await createClient();

  const { data: unlock } = await supabase
    .from('unlocked_seller_contacts')
    .select('contact_unlock_id')
    .eq('property_id', propertyId)
    .maybeSingle();

  if (!unlock) return null;

  const { data } = await supabase
    .from('properties')
    .select('address')
    .eq('id', propertyId)
    .maybeSingle();

  return data?.address ?? null;
}

/**
 * §25 analytics — records one view per visitor per IST day.
 *
 * The visitor key is a salted hash of IP + user agent: enough to collapse
 * refreshes into a single view, not enough to identify anyone. The salt is the
 * Supabase anon key, which is already deployment-specific.
 */
export async function recordPropertyView(propertyId: string): Promise<void> {
  try {
    const headerList = await headers();
    const ip =
      headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      headerList.get('x-real-ip') ??
      'unknown';
    const agent = headerList.get('user-agent') ?? 'unknown';

    const visitorHash = createHash('sha256')
      .update(`${ip}|${agent}|${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''}`)
      .digest('hex')
      .slice(0, 64);

    const supabase = await createClient();
    await supabase.rpc('record_property_view', {
      p_property_id: propertyId,
      p_visitor_hash: visitorHash,
    });
  } catch {
    // Analytics must never break a page render.
  }
}
