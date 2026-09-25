'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUser } from '@/lib/auth/session';

export type SaveResult =
  | { status: 'saved' }
  | { status: 'removed' }
  | { status: 'sign_in_required' }
  | { status: 'error'; message: string };

/**
 * §14 — save / unsave. The unique index on (user_id, property_id) is what
 * actually prevents duplicates, so a double-click races harmlessly.
 */
export async function toggleSavedProperty(propertyId: string): Promise<SaveResult> {
  const user = await getUser();
  if (!user) return { status: 'sign_in_required' };

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from('saved_properties')
    .select('id')
    .eq('user_id', user.id)
    .eq('property_id', propertyId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from('saved_properties').delete().eq('id', existing.id);
    if (error) return { status: 'error', message: error.message };

    revalidatePath('/saved');
    return { status: 'removed' };
  }

  const { error } = await supabase
    .from('saved_properties')
    .insert({ user_id: user.id, property_id: propertyId });

  if (error) {
    // 23505 = the unique constraint; a concurrent save already won, which is
    // the outcome the user wanted anyway.
    if (error.code === '23505') return { status: 'saved' };
    return { status: 'error', message: error.message };
  }

  revalidatePath('/saved');
  return { status: 'saved' };
}

export async function removeSavedProperty(propertyId: string): Promise<SaveResult> {
  const user = await getUser();
  if (!user) return { status: 'sign_in_required' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('saved_properties')
    .delete()
    .eq('user_id', user.id)
    .eq('property_id', propertyId);

  if (error) return { status: 'error', message: error.message };

  revalidatePath('/saved');
  return { status: 'removed' };
}
