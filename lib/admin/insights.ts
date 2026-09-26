import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

/**
 * §16 — what the platform is actually doing.
 *
 * Every number here comes from data the app has been recording since the schema
 * went in. Nothing new is collected and no new table exists: `property_views`
 * has one row per unique visitor per listing per IST day, written by
 * `record_property_view()`, and admins could already read it through
 * `property_views_select_owner`.
 *
 * What it cannot tell you is who anybody is. `visitor_hash` is a salted,
 * one-way digest of IP and user agent, kept only to collapse repeat views — so
 * these are counts of people, never a list of them. That is a deliberate limit,
 * and it is most of why this needs no consent banner.
 *
 * Aggregated in JavaScript from a handful of windowed reads rather than with a
 * count query per metric per period, which would be roughly twenty-five round
 * trips to render one page.
 */

/** Today's date in IST, as `YYYY-MM-DD` — the same boundary `viewed_on` uses. */
function istToday(): string {
  // en-CA formats as YYYY-MM-DD, which is what the date column holds.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

function istDateDaysAgo(days: number): string {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
}

/**
 * The instant an IST day begins, for the `timestamptz` columns.
 *
 * IST is a fixed +05:30 with no daylight saving, so this is exact rather than an
 * approximation that drifts twice a year.
 */
function istDayStart(date: string): string {
  return new Date(`${date}T00:00:00+05:30`).toISOString();
}

/**
 * A ceiling on rows pulled per window. Far above current volume; if it is ever
 * reached the page under-reports rather than timing out, and the number below
 * says so out loud instead of failing quietly.
 */
const ROW_CAP = 20000;

export type PeriodStats = {
  /** Unique visitor-listing-days, not page hits. */
  views: number;
  viewsSignedIn: number;
  viewsAnonymous: number;
  unlocks: number;
  paidUnlocks: number;
  revenue: number;
  leads: number;
  newUsers: number;
  newListings: number;
};

export type TopListing = {
  id: string;
  title: string;
  slug: string | null;
  views: number;
  saves: number;
  unlocks: number;
  leads: number;
};

export type Insights = {
  today: PeriodStats;
  week: PeriodStats;
  month: PeriodStats;
  /** Oldest first, one entry per IST day, zero-filled. */
  trend: { date: string; views: number }[];
  topListings: TopListing[];
  allTime: {
    views: number;
    unlocks: number;
    leads: number;
    revenue: number;
    users: number;
    published: number;
  };
  /** True when a window hit ROW_CAP, so the page can say the figures are partial. */
  truncated: boolean;
};

const TREND_DAYS = 14;

function emptyStats(): PeriodStats {
  return {
    views: 0,
    viewsSignedIn: 0,
    viewsAnonymous: 0,
    unlocks: 0,
    paidUnlocks: 0,
    revenue: 0,
    leads: 0,
    newUsers: 0,
    newListings: 0,
  };
}

export const getInsights = cache(async (): Promise<Insights> => {
  const supabase = await createClient();

  const today = istToday();
  const weekStart = istDateDaysAgo(6); // today inclusive = 7 days
  const monthStart = istDateDaysAgo(29);
  const monthStartInstant = istDayStart(monthStart);
  const weekStartInstant = istDayStart(weekStart);
  const todayInstant = istDayStart(today);

  const [views, unlocks, leads, users, listings, allViews, allUnlocks, allLeads, allUsers, allPublished, top] =
    await Promise.all([
      supabase
        .from('property_views')
        .select('viewed_on, viewer_id')
        .gte('viewed_on', monthStart)
        .limit(ROW_CAP),
      supabase
        .from('contact_unlocks')
        .select('unlocked_at, is_free, amount, payment_status')
        .gte('unlocked_at', monthStartInstant)
        .limit(ROW_CAP),
      supabase.from('leads').select('created_at').gte('created_at', monthStartInstant).limit(ROW_CAP),
      supabase.from('profiles').select('created_at').gte('created_at', monthStartInstant).limit(ROW_CAP),
      supabase.from('properties').select('created_at').gte('created_at', monthStartInstant).limit(ROW_CAP),

      // All-time headlines, as counts so they never ship rows.
      supabase.from('property_views').select('id', { count: 'exact', head: true }),
      supabase
        .from('contact_unlocks')
        .select('id', { count: 'exact', head: true })
        .eq('payment_status', 'success'),
      supabase.from('leads').select('id', { count: 'exact', head: true }),
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase
        .from('properties')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'published'),

      supabase
        .from('properties')
        .select('id, title, slug, views_count, saves_count, unlocks_count, leads_count')
        .order('views_count', { ascending: false })
        .limit(8),
    ]);

  const viewRows = (views.data ?? []) as { viewed_on: string; viewer_id: string | null }[];
  const unlockRows = (unlocks.data ?? []) as {
    unlocked_at: string;
    is_free: boolean;
    amount: number | string;
    payment_status: string;
  }[];
  const leadRows = (leads.data ?? []) as { created_at: string }[];
  const userRows = (users.data ?? []) as { created_at: string }[];
  const listingRows = (listings.data ?? []) as { created_at: string }[];

  const month = emptyStats();
  const week = emptyStats();
  const todayStats = emptyStats();

  // --- Views, bucketed by the IST date they were recorded against ------------
  const byDay = new Map<string, number>();

  for (const row of viewRows) {
    byDay.set(row.viewed_on, (byDay.get(row.viewed_on) ?? 0) + 1);

    const buckets = [month];
    if (row.viewed_on >= weekStart) buckets.push(week);
    if (row.viewed_on === today) buckets.push(todayStats);

    for (const bucket of buckets) {
      bucket.views += 1;
      if (row.viewer_id) bucket.viewsSignedIn += 1;
      else bucket.viewsAnonymous += 1;
    }
  }

  // --- Unlocks and the money they brought in ---------------------------------
  for (const row of unlockRows) {
    // A created-but-unpaid unlock is not an unlock; only settled ones count.
    if (row.payment_status !== 'success') continue;

    const buckets = [month];
    if (row.unlocked_at >= weekStartInstant) buckets.push(week);
    if (row.unlocked_at >= todayInstant) buckets.push(todayStats);

    const amount = Number(row.amount) || 0;
    for (const bucket of buckets) {
      bucket.unlocks += 1;
      if (!row.is_free) {
        bucket.paidUnlocks += 1;
        bucket.revenue += amount;
      }
    }
  }

  const tally = (rows: { created_at: string }[], key: 'leads' | 'newUsers' | 'newListings') => {
    for (const row of rows) {
      month[key] += 1;
      if (row.created_at >= weekStartInstant) week[key] += 1;
      if (row.created_at >= todayInstant) todayStats[key] += 1;
    }
  };

  tally(leadRows, 'leads');
  tally(userRows, 'newUsers');
  tally(listingRows, 'newListings');

  // --- The trend, zero-filled so a quiet day is a gap and not a missing bar --
  const trend: { date: string; views: number }[] = [];
  for (let i = TREND_DAYS - 1; i >= 0; i--) {
    const date = istDateDaysAgo(i);
    trend.push({ date, views: byDay.get(date) ?? 0 });
  }

  const topRows = (top.data ?? []) as {
    id: string;
    title: string;
    slug: string | null;
    views_count: number;
    saves_count: number;
    unlocks_count: number;
    leads_count: number;
  }[];

  return {
    today: todayStats,
    week,
    month,
    trend,
    topListings: topRows.map((r) => ({
      id: r.id,
      title: r.title,
      slug: r.slug,
      views: r.views_count,
      saves: r.saves_count,
      unlocks: r.unlocks_count,
      leads: r.leads_count,
    })),
    allTime: {
      views: allViews.count ?? 0,
      unlocks: allUnlocks.count ?? 0,
      leads: allLeads.count ?? 0,
      // Revenue over 30 days only: the windowed read is the one that carries
      // amounts, and an all-time figure would need its own unbounded scan.
      revenue: month.revenue,
      users: allUsers.count ?? 0,
      published: allPublished.count ?? 0,
    },
    truncated:
      viewRows.length >= ROW_CAP ||
      unlockRows.length >= ROW_CAP ||
      leadRows.length >= ROW_CAP,
  };
});
