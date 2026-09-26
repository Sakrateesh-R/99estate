'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getUser, getProfile } from '@/lib/auth/session';
import {
  propertyDraftSchema,
  submissionSchema,
  amenitiesSchema,
  MIN_IMAGES_FOR_SUBMISSION,
} from '@/lib/properties/schema';
import type { Enums } from '@/types/database.types';

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

function fail(error: string, fieldErrors?: Record<string, string>): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

function collectFieldErrors(issues: z.ZodIssue[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.join('.');
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

/**
 * Guard used by every write below.
 *
 * RLS enforces ownership independently, so this is about returning a helpful
 * message instead of an opaque "row not found" — not about being the gate.
 */
async function requireOwnedProperty(propertyId: string) {
  const deny = (error: string) => ({ ok: false as const, error });

  const user = await getUser();
  if (!user) return deny('Your session expired. Please sign in again.');

  const supabase = await createClient();
  const { data } = await supabase
    .from('properties')
    .select('id, seller_id, status, slug, title')
    .eq('id', propertyId)
    .maybeSingle();

  if (!data) return deny('That listing no longer exists.');

  if (data.seller_id !== user.id) {
    /**
     * An admin finishing a listing they posted on a seller's behalf (§12) works
     * through this same wizard, so this gate has to let them past.
     *
     * It grants nothing new: `properties_update_own` and the storage policies
     * have always been `... or is_admin()`, and `properties_guard_write` waves
     * admins through. Without this the admin would be stopped here by the one
     * layer that was never the one enforcing ownership.
     */
    const profile = await getProfile();
    if (profile?.role !== 'admin') return deny('You can only edit your own listings.');
  }

  return { ok: true as const, user, property: data, supabase };
}

// ---------------------------------------------------------------------------
// Create / update the listing row
// ---------------------------------------------------------------------------

/**
 * Saves steps 1–3 of the wizard (§12). Creates the row on first save and
 * updates it thereafter, so images and amenities in later steps have a real
 * `property_id` to attach to.
 */
export async function savePropertyDraft(
  propertyId: string | null,
  raw: unknown,
): Promise<ActionResult<{ propertyId: string }>> {
  const user = await getUser();
  if (!user) return fail('Your session expired. Please sign in again.');

  const profile = await getProfile();
  if (!profile?.is_profile_complete) {
    return fail('Add your name and mobile number before posting a property.');
  }

  const parsed = propertyDraftSchema.safeParse(raw);
  if (!parsed.success) {
    return fail('Please fix the highlighted fields.', collectFieldErrors(parsed.error.issues));
  }

  const supabase = await createClient();
  const values = parsed.data;

  if (propertyId) {
    const owned = await requireOwnedProperty(propertyId);
    if (!owned.ok) return fail(owned.error);

    const { error } = await supabase.from('properties').update(values).eq('id', propertyId);
    if (error) return fail(error.message);

    revalidatePath('/dashboard/properties');
    return { ok: true, data: { propertyId } };
  }

  const { data, error } = await supabase
    .from('properties')
    .insert({ ...values, seller_id: user.id, status: 'draft' })
    .select('id')
    .single();

  if (error) return fail(error.message);

  // §3 — posting a property is what promotes a buyer to an owner. Agents and
  // builders keep their existing role.
  if (profile.role === 'buyer') {
    await supabase.from('profiles').update({ role: 'owner' }).eq('id', user.id);
    revalidatePath('/', 'layout');
  }

  revalidatePath('/dashboard/properties');
  return { ok: true, data: { propertyId: data.id } };
}

// ---------------------------------------------------------------------------
// Amenities
// ---------------------------------------------------------------------------

export async function setPropertyAmenities(
  propertyId: string,
  amenities: string[],
): Promise<ActionResult> {
  const owned = await requireOwnedProperty(propertyId);
  if (!owned.ok) return fail(owned.error);

  const parsed = amenitiesSchema.safeParse({ amenities });
  if (!parsed.success) return fail('Some of those amenities are not valid.');

  const { supabase } = owned;
  const wanted = [...new Set(parsed.data.amenities)];

  // Replace-in-place: delete what was removed, insert what is new. Cheaper and
  // less destructive than a blanket delete-all + re-insert.
  const { data: existing } = await supabase
    .from('property_amenities')
    .select('id, amenity_name')
    .eq('property_id', propertyId);

  const current = existing ?? [];
  const toRemove = current.filter((row) => !wanted.includes(row.amenity_name)).map((r) => r.id);
  const currentNames = new Set(current.map((r) => r.amenity_name));
  const toAdd = wanted.filter((name) => !currentNames.has(name));

  if (toRemove.length) {
    const { error } = await supabase.from('property_amenities').delete().in('id', toRemove);
    if (error) return fail(error.message);
  }

  if (toAdd.length) {
    const { error } = await supabase
      .from('property_amenities')
      .insert(toAdd.map((amenity_name) => ({ property_id: propertyId, amenity_name })));
    if (error) return fail(error.message);
  }

  revalidatePath(`/dashboard/properties/${propertyId}/edit`);
  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Submission
// ---------------------------------------------------------------------------

/**
 * §12 — moves a draft to `pending`. Admin approval is what makes it public;
 * the status guard trigger refuses any attempt to go straight to `published`.
 */
export async function submitPropertyForReview(
  propertyId: string,
): Promise<ActionResult<{ status: Enums<'property_status'> }>> {
  const owned = await requireOwnedProperty(propertyId);
  if (!owned.ok) return fail(owned.error);

  const { supabase } = owned;

  const { data: property } = await supabase
    .from('properties')
    .select('*')
    .eq('id', propertyId)
    .single();

  if (!property) return fail('That listing no longer exists.');

  const parsed = submissionSchema.safeParse(property);
  if (!parsed.success) {
    return fail(
      'This listing is not ready to publish yet.',
      collectFieldErrors(parsed.error.issues),
    );
  }

  const { count } = await supabase
    .from('property_images')
    .select('id', { count: 'exact', head: true })
    .eq('property_id', propertyId);

  if ((count ?? 0) < MIN_IMAGES_FOR_SUBMISSION) {
    return fail(
      `Add at least ${MIN_IMAGES_FOR_SUBMISSION} photos before submitting — listings with photos get far more enquiries.`,
    );
  }

  const { error } = await supabase
    .from('properties')
    .update({ status: 'pending' })
    .eq('id', propertyId);

  if (error) return fail(error.message);

  revalidatePath('/dashboard/properties');
  return { ok: true, data: { status: 'pending' } };
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/** Seller-driven status changes: pause, resume, mark sold/rented (§18). */
export async function updatePropertyStatus(
  propertyId: string,
  status: Extract<Enums<'property_status'>, 'published' | 'paused' | 'sold' | 'rented' | 'pending'>,
): Promise<ActionResult> {
  const owned = await requireOwnedProperty(propertyId);
  if (!owned.ok) return fail(owned.error);

  const { error } = await owned.supabase
    .from('properties')
    .update({ status })
    .eq('id', propertyId);

  // The lifecycle guard trigger raises 42501 with a readable message for any
  // transition a seller is not allowed to make; surface it verbatim.
  if (error) return fail(error.message);

  revalidatePath('/dashboard/properties');
  revalidatePath('/properties');
  return { ok: true, data: undefined };
}

/** §18 — resets the 90-day clock via the database RPC. */
export async function renewProperty(propertyId: string): Promise<ActionResult<{ expiresAt: string }>> {
  const owned = await requireOwnedProperty(propertyId);
  if (!owned.ok) return fail(owned.error);

  const { data, error } = await owned.supabase.rpc('renew_property', { p_property_id: propertyId });
  if (error) return fail(error.message);

  const result = data as { ok?: boolean; code?: string; expires_at?: string } | null;
  if (!result?.ok) return fail('This listing cannot be renewed right now.');

  revalidatePath('/dashboard/properties');
  return { ok: true, data: { expiresAt: result.expires_at ?? '' } };
}

export async function deleteProperty(propertyId: string): Promise<ActionResult> {
  const owned = await requireOwnedProperty(propertyId);
  if (!owned.ok) return fail(owned.error);

  const { supabase, property } = owned;

  // Remove the objects first: deleting the row cascades the manifest away and
  // we would lose the paths needed to clean up Storage.
  const { data: images } = await supabase
    .from('property_images')
    .select('storage_path')
    .eq('property_id', propertyId);

  if (images?.length) {
    await supabase.storage.from('property-images').remove(images.map((i) => i.storage_path));
  }

  const { error } = await supabase.from('properties').delete().eq('id', propertyId);
  if (error) return fail(error.message);

  revalidatePath('/dashboard/properties');
  revalidatePath(`/property/${property.slug ?? ''}-${propertyId}`);
  return { ok: true, data: undefined };
}
