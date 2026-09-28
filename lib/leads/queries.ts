import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { getUser } from '@/lib/auth/session';
import type { Enums } from '@/types/database.types';

/**
 * §15 — the seller's lead inbox.
 *
 * Every read goes through `lead_details`, never the `leads` table, because the
 * view carries the buyer's name and mobile.
 *
 * It used to say here that the view filters to `auth.uid()` internally, so a
 * query could not widen to somebody else's enquiries. That was true of every
 * ordinary user and false of an admin: the WHERE clause ended `or
 * public.is_admin()`, so an unfiltered read returned every lead on the site,
 * buyer phone numbers included, on what is meant to be a personal dashboard.
 *
 * Both halves are fixed. Migration 019 narrows the view, and the queries below
 * name their own scope rather than trusting it — an admin's Enquiries page
 * shows the listings they are responsible for, and a system-wide view lives in
 * the admin console where it can be labelled as one.
 *
 * The buyer contact in here is the thing the seller earned when a buyer spent
 * a free unlock or ₹9. It is as sensitive as the seller contact the whole
 * paywall protects, and it never belongs in a public surface.
 */

export type LeadRow = {
  id: string;
  property_id: string;
  status: Enums<'lead_status'>;
  notes: string | null;
  created_at: string;
  last_status_change_at: string;
  buyer_name: string | null;
  buyer_mobile: string | null;
  buyer_avatar: string | null;
  property_title: string;
  property_slug: string | null;
  property_city: string;
  property_locality: string | null;
  property_price: number;
  listing_type: Enums<'listing_type'>;
  unlock_was_free: boolean;
  unlock_amount: number | null;
  unlocked_at: string;
};

/**
 * One literal, not a concatenation: the generated Supabase types parse the
 * select string to infer the row shape, and they can only do that when it is
 * statically a literal.
 */
const COLUMNS =
  'id, property_id, status, notes, created_at, last_status_change_at, buyer_name, buyer_mobile, buyer_avatar, property_title, property_slug, property_city, property_locality, property_price, listing_type, unlock_was_free, unlock_amount, unlocked_at' as const;

export type LeadFilters = {
  status: Enums<'lead_status'> | null;
  propertyId: string | null;
};

/**
 * The listings whose enquiries belong on this account's dashboard: its own,
 * plus any it posted on somebody else's behalf.
 *
 * Returns null when there is nobody signed in, which callers treat as "no
 * leads" rather than "no filter".
 */
async function leadScope(): Promise<{ sellerId: string; postedIds: string[] } | null> {
  const user = await getUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase.from('properties').select('id').eq('posted_by', user.id);

  return { sellerId: user.id, postedIds: (data ?? []).map((r) => r.id) };
}

function applyScope<T>(query: T, scope: { sellerId: string; postedIds: string[] }): T {
  const q = query as { eq: (c: string, v: string) => T; or: (f: string) => T };

  // `or` only when there is something to or with — an empty `in.()` is a
  // syntax error, and most accounts have posted nothing on anyone's behalf.
  return scope.postedIds.length > 0
    ? q.or(`seller_id.eq.${scope.sellerId},property_id.in.(${scope.postedIds.join(',')})`)
    : q.eq('seller_id', scope.sellerId);
}

export const getLeads = cache(async (filters: LeadFilters): Promise<LeadRow[]> => {
  const supabase = await createClient();

  const scope = await leadScope();
  if (!scope) return [];

  let query = applyScope(
    supabase.from('lead_details').select(COLUMNS),
    scope,
  )
    .order('created_at', { ascending: false })
    .limit(200);

  if (filters.status) query = query.eq('status', filters.status);
  if (filters.propertyId) query = query.eq('property_id', filters.propertyId);

  const { data } = await query;
  return (data ?? []) as LeadRow[];
});

export type LeadSummary = {
  total: number;
  /** Not yet acted on — the number worth surfacing as a badge. */
  unactioned: number;
  thisWeek: number;
  byStatus: Record<string, number>;
  /** Listings that have produced at least one enquiry, most recent first. */
  properties: { id: string; title: string; count: number }[];
};

/**
 * Counts for the header and the filter chips.
 *
 * Read from the same view in one pass rather than as a count per status —
 * seven round trips to render a row of chips is not worth the tidier code,
 * and the view is already capped at what one seller owns.
 */
export const getLeadSummary = cache(async (): Promise<LeadSummary> => {
  const supabase = await createClient();

  const scope = await leadScope();
  if (!scope) {
    return { total: 0, unactioned: 0, thisWeek: 0, byStatus: {}, properties: [] };
  }

  const { data } = await applyScope(
    supabase.from('lead_details').select('id, status, created_at, property_id, property_title'),
    scope,
  )
    .order('created_at', { ascending: false })
    .limit(1000);

  const rows = (data ?? []) as {
    id: string;
    status: Enums<'lead_status'>;
    created_at: string;
    property_id: string;
    property_title: string;
  }[];

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const byStatus: Record<string, number> = {};
  const byProperty = new Map<string, { id: string; title: string; count: number }>();

  for (const row of rows) {
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;

    const existing = byProperty.get(row.property_id);
    if (existing) existing.count += 1;
    else byProperty.set(row.property_id, { id: row.property_id, title: row.property_title, count: 1 });
  }

  return {
    total: rows.length,
    unactioned: byStatus.new ?? 0,
    thisWeek: rows.filter((r) => new Date(r.created_at).getTime() >= weekAgo).length,
    byStatus,
    properties: [...byProperty.values()],
  };
});
