'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUser } from '@/lib/auth/session';
import type { ActionResult } from '@/lib/properties/actions';

/**
 * §19 — the three things a recipient may do with a notification.
 *
 * None of them can change what it says. `notifications_guard_write` copies
 * title, message, type, link and owner back from the old row on every update,
 * so `is_read` is the only field an update from here can actually move. That
 * matters because a notification is the platform's word, not the recipient's:
 * somebody who could rewrite "Listing needs changes" into "Listing verified"
 * would have a screenshot worth showing a buyer.
 *
 * Deleting is allowed outright — it is the recipient's own copy, and an inbox
 * you cannot clear stops being read at all.
 */

function expired(): ActionResult<never> {
  return { ok: false, error: 'Your session expired. Please sign in again.' };
}

export async function markNotificationRead(id: string): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return expired();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  // RLS filters rather than errors, so somebody else's notification simply is
  // not there to find.
  if (!data) return { ok: false, error: 'That notification could not be found.' };

  revalidatePath('/notifications');
  return { ok: true, data: undefined };
}

/** Returns how many were still unread, so the caller can say what it did. */
export async function markAllNotificationsRead(): Promise<ActionResult<number>> {
  const user = await getUser();
  if (!user) return expired();

  const supabase = await createClient();

  // `is_read = false` is not just an optimisation: without it this rewrites
  // every notification the user has ever received on each click.
  const { data, error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', user.id)
    .eq('is_read', false)
    .select('id');

  if (error) return { ok: false, error: error.message };

  revalidatePath('/notifications');
  return { ok: true, data: data?.length ?? 0 };
}

export async function deleteNotification(id: string): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return expired();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'That notification could not be found.' };

  revalidatePath('/notifications');
  return { ok: true, data: undefined };
}
