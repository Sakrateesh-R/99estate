import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { Enums } from '@/types/database.types';

/**
 * §15 — the seller's lead inbox.
 *
 * Every read goes through `lead_details`, never the `leads` table. The view
 * carries the buyer's name and mobile, and it filters to `auth.uid()` inside
 * itself — so the query cannot accidentally widen to somebody else's
 * enquiries, whatever is passed to it.
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

export const getLeads = cache(async (filters: LeadFilters): Promise<LeadRow[]> => {
  const supabase = await createClient();

  let query = supabase
    .from('lead_details')
    .select(COLUMNS)
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

  const { data } = await supabase
    .from('lead_details')
    .select('id, status, created_at, property_id, property_title')
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
