import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { Enums } from '@/types/database.types';

/**
 * §19 — the recipient's side of the notification system.
 *
 * Everything the platform decides about a person already lands in
 * `notifications`: an approval, a rejection, a new enquiry, a payment, a
 * listing about to expire. `create_notification` is revoked from
 * `authenticated`, so nothing in the app writes that table — these reads are
 * the only way any of it reaches a human.
 *
 * No query here passes a user id. The RLS policy restricts the table to
 * `user_id = auth.uid()`, so there is no widening to get wrong: the worst a
 * bug in this file can do is show somebody less of their own inbox.
 */

export type NotificationRow = {
  id: string;
  title: string;
  message: string | null;
  type: Enums<'notification_type'>;
  link: string | null;
  is_read: boolean;
  created_at: string;
};

/**
 * One literal, not a concatenation — the generated Supabase types infer the
 * row shape by parsing this string, which only works when it is static.
 */
const COLUMNS = 'id, title, message, type, link, is_read, created_at' as const;

/** How many of the newest notifications the bell menu previews. */
export const BELL_PREVIEW_COUNT = 8;

export type NotificationInbox = {
  items: NotificationRow[];
  unread: number;
};

/**
 * What the header bell needs, in one place.
 *
 * This runs on nearly every page load for a signed-in user, which is why
 * `notifications_inbox_idx (user_id, created_at desc)` and
 * `notifications_unread_idx (user_id) where not is_read` exist — both reads
 * below are index-only, and the count never ships a row.
 */
export const getNotificationInbox = cache(async (): Promise<NotificationInbox> => {
  const supabase = await createClient();

  const [recent, unread] = await Promise.all([
    supabase
      .from('notifications')
      .select(COLUMNS)
      .order('created_at', { ascending: false })
      .limit(BELL_PREVIEW_COUNT),
    supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('is_read', false),
  ]);

  return {
    items: (recent.data ?? []) as NotificationRow[],
    unread: unread.count ?? 0,
  };
});

/** The full inbox page. Capped: nobody scrolls to their 101st notice. */
export const getNotifications = cache(async (unreadOnly: boolean): Promise<NotificationRow[]> => {
  const supabase = await createClient();

  let query = supabase
    .from('notifications')
    .select(COLUMNS)
    .order('created_at', { ascending: false })
    .limit(100);

  if (unreadOnly) query = query.eq('is_read', false);

  const { data } = await query;
  return (data ?? []) as NotificationRow[];
});
