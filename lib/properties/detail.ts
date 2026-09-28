import { cache } from 'react';
import { createHash } from 'node:crypto';
import { headers } from 'next/headers';
import { createClient, createDeferredClient } from '@/lib/supabase/server';
import { getUser } from '@/lib/auth/session';
import type { PropertyRef } from '@/lib/utils';
import type { Enums, Tables } from '@/types/database.types';

/**
 * Columns safe to render on a public property page.
 *
 * `address` is intentionally excluded (§8 — the exact door number is part of
 * what a buyer unlocks) and no seller contact column appears anywhere.
 */
const DETAIL_COLUMNS = [
  'id', 'slug', 'public_code', 'seller_id', 'title', 'description',
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
  | 'address'
  | 'rejection_reason'
  | 'last_renewed_at'
  | 'unlocks_count'
  | 'leads_count'
  | 'posted_by'
  // Provenance for the coordinates, not something the page renders. Omitted
  // here as well as unselected, so the two lists keep agreeing.
  | 'map_url'
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
  /** Owner, or the admin who posted it for them. See the note where it is set. */
  isManagedByViewer: boolean;
};

/**
 * Everything the public property page needs, in three parallel reads.
 *
 * Wrapped in `cache` because `generateMetadata` and the page component both
 * need it, and Next runs them separately.
 */
export const getPropertyDetail = cache(async (ref: PropertyRef): Promise<PropertyDetailData | null> => {
  const supabase = await createClient();

  /**
   * One query either way: the short code is the current URL form, the UUID is
   * the one that shipped first and still has to resolve.
   *
   * `posted_by` is selected and then immediately destructured away. It is needed
   * to answer "is this viewer the admin who typed this listing in", and it must
   * not reach the page — `property` is returned whole, so anything left on it is
   * serialised into a payload the public can read.
   */
  const { data: row } = await supabase
    .from('properties')
    .select(`${DETAIL_COLUMNS}, posted_by`)
    .eq(ref.kind === 'code' ? 'public_code' : 'id', ref.value)
    .maybeSingle<PropertyDetail & { posted_by: string | null }>();

  // RLS has already decided visibility: a stranger simply gets nothing back
  // for a draft or expired listing, while the owner and admins still see it.
  if (!row) return null;

  const { posted_by: postedBy, ...property } = row;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [images, amenities, seller, saved] = await Promise.all([
    supabase
      .from('property_images')
      .select('id, public_url, is_cover, width, height')
      .eq('property_id', property.id)
      .order('is_cover', { ascending: false })
      .order('sort_order')
      .order('created_at'),
    supabase.from('property_amenities').select('amenity_name').eq('property_id', property.id),
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
          .eq('property_id', property.id)
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
    /**
     * Whether this viewer is responsible for the listing rather than shopping
     * for it — its owner, or the admin who entered it on their behalf.
     *
     * Separate from `isOwnListing` because that means "yours" and drives things
     * like hiding the unlock card. This one answers "may you see the private
     * parts of your own listing", which the admin who typed it in must, since
     * for a placeholder owner they are the only person who ever can.
     */
    isManagedByViewer: Boolean(
      user && (user.id === property.seller_id || (postedBy !== null && user.id === postedBy)),
    ),
  };
});

/**
 * Street address, revealed only once the buyer holds a settled unlock.
 * Kept out of `getPropertyDetail` so it can never be serialised into the
 * public page payload by accident.
 */
export async function getUnlockedAddress(propertyId: string): Promise<string | null> {
  const supabase = await createClient();

  const user = await getUser();
  if (!user) return null;

  const { data: unlock } = await supabase
    .from('unlocked_seller_contacts')
    .select('contact_unlock_id')
    .eq('property_id', propertyId)
    // Whose unlock, not just which listing — see the note in
    // lib/contacts/unlocked.ts.
    .eq('buyer_id', user.id)
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
 * Returns the write as a task to hand to `after()`, rather than doing it
 * inline, because tracking must not add latency to the page it is measuring.
 *
 * The split is the whole point. Everything that needs the request — the headers,
 * the cookie jar — is read *here*, during the render. `after()` runs once the
 * response has gone, and a request API touched in there throws:
 *
 *   Route /property/[slug] used "headers" inside "after(...)".
 *
 * Which is exactly what used to happen. The throw was swallowed by a bare
 * `catch {}`, so tracking recorded nothing at all from the day it shipped while
 * every listing reported "0 views" — indistinguishable from having no visitors,
 * and so invisible. Returning a closure that touches no request API makes the
 * mistake hard to make again; the errors below make it loud if it happens.
 *
 * The visitor key is a salted hash of IP + user agent: enough to collapse
 * refreshes into a single view, not enough to identify anyone. The salt is the
 * Supabase anon key, which is already deployment-specific.
 */
export async function prepareViewTracking(propertyId: string): Promise<() => Promise<void>> {
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

  // Carries the session, so the database can still tell that a seller is
  // looking at their own listing and decline to count it.
  const supabase = await createDeferredClient();

  return async () => {
    try {
      const { error } = await supabase.rpc('record_property_view', {
        p_property_id: propertyId,
        p_visitor_hash: visitorHash,
      });

      // Analytics must never break a page render — but it must not fail in
      // silence either.
      if (error) {
        console.error('[analytics] record_property_view failed', {
          propertyId,
          code: error.code,
          message: error.message,
        });
      }
    } catch (cause) {
      console.error('[analytics] recordPropertyView threw', {
        propertyId,
        message: cause instanceof Error ? cause.message : String(cause),
      });
    }
  };
}
