import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { getUser } from '@/lib/auth/session';
import { FREE_DAILY_UNLOCKS } from '@/lib/constants';

export type DailyContactUsage = {
  freeLimit: number;
  freeUsed: number;
  freeRemaining: number;
  paidToday: number;
  totalToday: number;
  resetsAt: string | null;
};

/**
 * Rule 4 / Rule 10 — the daily free-unlock counter.
 *
 * Always read from the database RPC: the reset boundary is 00:00 IST, which
 * the browser's clock and timezone cannot be trusted to agree on, and the
 * count itself must not be inferred from anything the client holds.
 */
export const getDailyContactUsage = cache(async (): Promise<DailyContactUsage | null> => {
  const user = await getUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_daily_contact_usage', { p_user_id: user.id });

  if (error || !data || data.length === 0) {
    // Degrade to "no free unlocks known" rather than inventing a quota —
    // the unlock RPC re-checks anyway, so the worst case is a pessimistic label.
    return null;
  }

  const row = data[0]!;
  return {
    freeLimit: row.free_limit ?? FREE_DAILY_UNLOCKS,
    freeUsed: row.free_used ?? 0,
    freeRemaining: row.free_remaining ?? 0,
    paidToday: row.paid_today ?? 0,
    totalToday: row.total_today ?? 0,
    resetsAt: row.resets_at ?? null,
  };
});

/** "2 free contacts available today" / "1 free contact remaining today" (§10). */
export function freeQuotaLabel(usage: DailyContactUsage | null): string {
  if (!usage) return `${FREE_DAILY_UNLOCKS} free contacts every day`;
  if (usage.freeRemaining === 0) return 'Free contacts used for today';
  if (usage.freeRemaining === 1) return '1 free contact remaining today';
  return `${usage.freeRemaining} free contacts available today`;
}
