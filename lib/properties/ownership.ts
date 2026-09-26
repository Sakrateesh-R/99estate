import { createClient } from '@/lib/supabase/server';
import { getProfile, getUser } from '@/lib/auth/session';

/**
 * The single answer to "may this caller write to this listing?".
 *
 * There were two copies of this — one in `actions.ts` guarding the wizard and
 * one in `image-actions.ts` guarding the photos — and when §12 let admins post
 * on a seller's behalf, only the first was taught about it. The result was an
 * admin who could fill in every field of a listing and then silently fail to
 * add a single photo, which is the one thing a listing cannot be submitted
 * without. Two implementations of one rule is how that happens, so now there is
 * one.
 *
 * Deliberately NOT in a `'use server'` module. Every export from one of those
 * becomes a callable HTTP endpoint, and an ownership check is the last thing
 * that should be reachable from outside.
 */
export async function requirePropertyAccess(propertyId: string) {
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
     * An admin finishing a listing they posted on a seller's behalf (§12)
     * works through the seller's own wizard and uploader, so both have to let
     * them past.
     *
     * This grants nothing the database was not already granting:
     * `properties_update_own`, `property_images_write` and the storage object
     * policies all read `... or is_admin()`. Without it the admin is stopped by
     * the app layer alone — the one layer that was never the thing enforcing
     * ownership.
     */
    const profile = await getProfile();
    if (profile?.role !== 'admin') return deny('You can only edit your own listings.');
  }

  return { ok: true as const, user, property: data, supabase };
}
