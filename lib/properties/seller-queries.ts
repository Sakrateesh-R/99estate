import { createClient } from '@/lib/supabase/server';
import type { Tables } from '@/types/database.types';
import type { RegisteredImage } from '@/lib/properties/image-actions';

export type SellerPropertyRow = Pick<
  Tables<'properties'>,
  | 'id'
  | 'slug'
  | 'title'
  | 'status'
  | 'verification_status'
  | 'listing_type'
  | 'property_type'
  | 'price'
  | 'city'
  | 'locality'
  | 'cover_image_url'
  | 'views_count'
  | 'saves_count'
  | 'unlocks_count'
  | 'leads_count'
  | 'published_at'
  | 'expires_at'
  | 'rejection_reason'
  | 'created_at'
  | 'updated_at'
>;

const SELLER_ROW_COLUMNS = [
  'id',
  'slug',
  'title',
  'status',
  'verification_status',
  'listing_type',
  'property_type',
  'price',
  'city',
  'locality',
  'cover_image_url',
  'views_count',
  'saves_count',
  'unlocks_count',
  'leads_count',
  'published_at',
  'expires_at',
  'rejection_reason',
  'created_at',
  'updated_at',
].join(', ');

export async function getSellerProperties(sellerId: string): Promise<SellerPropertyRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('properties')
    .select(SELLER_ROW_COLUMNS)
    .eq('seller_id', sellerId)
    .order('updated_at', { ascending: false })
    .returns<SellerPropertyRow[]>();

  return data ?? [];
}

export type SellerStats = {
  total: number;
  active: number;
  pending: number;
  drafts: number;
  views: number;
  unlocks: number;
  leads: number;
  saves: number;
};

/**
 * Dashboard KPI cards (§11).
 *
 * Reads only the counter columns — they are trigger-maintained, so this stays
 * one small scan instead of four correlated aggregates over views, saves,
 * unlocks and leads.
 */
export async function getSellerStats(sellerId: string): Promise<SellerStats> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('properties')
    .select('status, expires_at, views_count, saves_count, unlocks_count, leads_count')
    .eq('seller_id', sellerId);

  const rows = data ?? [];
  const now = Date.now();

  return rows.reduce<SellerStats>(
    (acc, row) => {
      acc.total += 1;
      if (row.status === 'published' && (!row.expires_at || new Date(row.expires_at).getTime() > now)) {
        acc.active += 1;
      }
      if (row.status === 'pending') acc.pending += 1;
      if (row.status === 'draft') acc.drafts += 1;
      acc.views += row.views_count;
      acc.saves += row.saves_count;
      acc.unlocks += row.unlocks_count;
      acc.leads += row.leads_count;
      return acc;
    },
    { total: 0, active: 0, pending: 0, drafts: 0, views: 0, unlocks: 0, leads: 0, saves: 0 },
  );
}

export type PropertyEditData = {
  property: Tables<'properties'>;
  amenities: string[];
  images: RegisteredImage[];
};

/**
 * Everything the wizard needs to resume editing an existing listing.
 *
 * `sellerId` of `null` drops the ownership filter, which is what an admin
 * finishing a listing they posted on someone's behalf needs (§12). That is not
 * a hole: `properties_select_own` is `seller_id = auth.uid() or is_admin()`, so
 * a non-admin passing null still sees only their own rows. The filter is
 * belt-and-braces for the ordinary path, not the thing enforcing it.
 */
export async function getPropertyForEdit(
  propertyId: string,
  sellerId: string | null,
): Promise<PropertyEditData | null> {
  const supabase = await createClient();

  let query = supabase.from('properties').select('*').eq('id', propertyId);
  if (sellerId) query = query.eq('seller_id', sellerId);

  const { data: property } = await query.maybeSingle();

  if (!property) return null;

  // Two small child reads in parallel rather than a nested select, so the
  // shapes stay flat and typed.
  const [{ data: amenities }, { data: images }] = await Promise.all([
    supabase.from('property_amenities').select('amenity_name').eq('property_id', propertyId),
    supabase
      .from('property_images')
      .select('id, storage_path, public_url, is_cover, sort_order')
      .eq('property_id', propertyId)
      .order('sort_order')
      .order('created_at'),
  ]);

  return {
    property,
    amenities: (amenities ?? []).map((a) => a.amenity_name),
    images: (images ?? []).map((i) => ({
      id: i.id,
      storagePath: i.storage_path,
      publicUrl: i.public_url,
      isCover: i.is_cover,
      sortOrder: i.sort_order,
    })),
  };
}

export async function getAmenityOptions(): Promise<{ name: string; category: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('amenities')
    .select('name, category')
    .eq('is_active', true)
    .order('category')
    .order('sort_order');

  return data ?? [];
}
