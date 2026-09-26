'use server';

import { revalidatePath } from 'next/cache';
import type { ActionResult } from '@/lib/properties/actions';
/**
 * Shared with the wizard's own actions. This file used to keep its own copy,
 * which did not know that an admin may work on a listing they posted for
 * somebody else — so the photos step refused them while every other step let
 * them through. See lib/properties/ownership.ts.
 */
import { requirePropertyAccess as requireOwnership } from '@/lib/properties/ownership';
import { MAX_IMAGE_BYTES, MAX_IMAGES_PER_PROPERTY } from '@/lib/properties/schema';

const BUCKET = 'property-images';

function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}

export type RegisteredImage = {
  id: string;
  storagePath: string;
  publicUrl: string;
  isCover: boolean;
  sortOrder: number;
};

/**
 * Records an object that the browser has already uploaded to Storage.
 *
 * The bytes go straight from the browser to Supabase (the storage policy
 * checks ownership from the object key), so Next never proxies megabytes of
 * image data. What this action does is the part that must not be trusted to
 * the client: it re-derives the public URL rather than accepting one, and it
 * refuses any key that does not sit under this property's own folder.
 */
export async function registerPropertyImage(
  propertyId: string,
  storagePath: string,
  meta: { width?: number; height?: number; byteSize?: number } = {},
): Promise<ActionResult<RegisteredImage>> {
  const owned = await requireOwnership(propertyId);
  if (!owned.ok) return fail(owned.error);

  const { supabase } = owned;

  const expectedPrefix = `properties/${propertyId}/`;
  if (!storagePath.startsWith(expectedPrefix) || storagePath.includes('..')) {
    return fail('That upload path is not valid for this listing.');
  }
  if (meta.byteSize && meta.byteSize > MAX_IMAGE_BYTES) {
    return fail('Images must be 10 MB or smaller.');
  }

  const { count } = await supabase
    .from('property_images')
    .select('id', { count: 'exact', head: true })
    .eq('property_id', propertyId);

  if ((count ?? 0) >= MAX_IMAGES_PER_PROPERTY) {
    return fail(`You can add up to ${MAX_IMAGES_PER_PROPERTY} photos per listing.`);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);

  const { data, error } = await supabase
    .from('property_images')
    .insert({
      property_id: propertyId,
      storage_path: storagePath,
      public_url: publicUrl,
      sort_order: count ?? 0,
      width: meta.width ?? null,
      height: meta.height ?? null,
      byte_size: meta.byteSize ?? null,
    })
    .select('id, storage_path, public_url, is_cover, sort_order')
    .single();

  if (error) {
    // The object is orphaned if the manifest row failed — clean it up rather
    // than leaving unreferenced bytes in the bucket.
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return fail(error.message);
  }

  revalidatePath(`/dashboard/properties/${propertyId}/edit`);

  return {
    ok: true,
    data: {
      id: data.id,
      storagePath: data.storage_path,
      publicUrl: data.public_url,
      isCover: data.is_cover,
      sortOrder: data.sort_order,
    },
  };
}

export async function deletePropertyImage(
  propertyId: string,
  imageId: string,
): Promise<ActionResult> {
  const owned = await requireOwnership(propertyId);
  if (!owned.ok) return fail(owned.error);

  const { supabase } = owned;

  const { data: image } = await supabase
    .from('property_images')
    .select('storage_path')
    .eq('id', imageId)
    .eq('property_id', propertyId)
    .maybeSingle();

  if (!image) return fail('That photo has already been removed.');

  const { error } = await supabase
    .from('property_images')
    .delete()
    .eq('id', imageId)
    .eq('property_id', propertyId);

  if (error) return fail(error.message);

  // Row first, object second: an orphaned object is harmless, a manifest row
  // pointing at a deleted object renders a broken image.
  await supabase.storage.from(BUCKET).remove([image.storage_path]);

  revalidatePath(`/dashboard/properties/${propertyId}/edit`);
  return { ok: true, data: undefined };
}

/**
 * §13 — set cover image. Two statements, because a partial unique index
 * (`WHERE is_cover`) permits exactly one cover per listing: the old one has to
 * be cleared before the new one can be set.
 */
export async function setCoverImage(propertyId: string, imageId: string): Promise<ActionResult> {
  const owned = await requireOwnership(propertyId);
  if (!owned.ok) return fail(owned.error);

  const { supabase } = owned;

  const { error: clearError } = await supabase
    .from('property_images')
    .update({ is_cover: false })
    .eq('property_id', propertyId)
    .eq('is_cover', true);

  if (clearError) return fail(clearError.message);

  const { error } = await supabase
    .from('property_images')
    .update({ is_cover: true })
    .eq('id', imageId)
    .eq('property_id', propertyId);

  if (error) return fail(error.message);

  revalidatePath(`/dashboard/properties/${propertyId}/edit`);
  return { ok: true, data: undefined };
}

/** §13 — persists a drag-and-drop reorder. */
export async function reorderPropertyImages(
  propertyId: string,
  orderedImageIds: string[],
): Promise<ActionResult> {
  const owned = await requireOwnership(propertyId);
  if (!owned.ok) return fail(owned.error);

  if (orderedImageIds.length > MAX_IMAGES_PER_PROPERTY) return fail('Too many photos.');

  const { supabase } = owned;

  const { data: owned_images } = await supabase
    .from('property_images')
    .select('id')
    .eq('property_id', propertyId);

  const valid = new Set((owned_images ?? []).map((i) => i.id));
  if (orderedImageIds.some((id) => !valid.has(id))) {
    return fail('That photo does not belong to this listing.');
  }

  const results = await Promise.all(
    orderedImageIds.map((id, index) =>
      supabase
        .from('property_images')
        .update({ sort_order: index })
        .eq('id', id)
        .eq('property_id', propertyId),
    ),
  );

  const firstError = results.find((r) => r.error)?.error;
  if (firstError) return fail(firstError.message);

  revalidatePath(`/dashboard/properties/${propertyId}/edit`);
  return { ok: true, data: undefined };
}
