import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { EXPIRY_WARNING_DAYS } from '@/lib/constants';
import type { Enums } from '@/types/database.types';

/**
 * §16 — reads for the admin console.
 *
 * Every query here runs as the signed-in admin, not the service role. The RLS
 * policies already grant admins the wider view (`using (... or is_admin())`),
 * so nothing needs elevating — and using the service role instead would mean
 * a bug in this file could read the whole database rather than being stopped
 * at the same wall as everyone else.
 */

export type QueueCounts = {
  pendingProperties: number;
  openReports: number;
  pendingVerifications: number;
  suspendedUsers: number;
  totalUsers: number;
  liveProperties: number;
  /**
   * Published listings already past `expires_at` (§18). Anything above zero
   * means the scheduled sweep is not reaching the database — the whole point of
   * surfacing it is that a silent cron failure looks exactly like nothing
   * happening.
   */
  overdueProperties: number;
  /** Published listings due to expire within the warning window. */
  expiringSoon: number;
};

export const getQueueCounts = cache(async (): Promise<QueueCounts> => {
  const supabase = await createClient();

  const now = new Date();
  const horizon = new Date(now.getTime() + EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000);

  // `head: true` so each of these is a COUNT and never ships rows.
  const [pending, reports, verifications, suspended, users, live, overdue, soon] = await Promise.all([
    supabase.from('properties').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('property_reports').select('*', { count: 'exact', head: true }).in('status', ['open', 'under_review']),
    supabase.from('verification_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('account_status', 'suspended'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('properties').select('*', { count: 'exact', head: true }).eq('status', 'published'),
    supabase
      .from('properties')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'published')
      .lte('expires_at', now.toISOString()),
    supabase
      .from('properties')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'published')
      .gt('expires_at', now.toISOString())
      .lte('expires_at', horizon.toISOString()),
  ]);

  return {
    pendingProperties: pending.count ?? 0,
    openReports: reports.count ?? 0,
    pendingVerifications: verifications.count ?? 0,
    suspendedUsers: suspended.count ?? 0,
    totalUsers: users.count ?? 0,
    liveProperties: live.count ?? 0,
    overdueProperties: overdue.count ?? 0,
    expiringSoon: soon.count ?? 0,
  };
});

// --- Moderation queue --------------------------------------------------------

export type ModerationRow = {
  id: string;
  title: string;
  slug: string | null;
  status: Enums<'property_status'>;
  property_type: Enums<'property_type'>;
  listing_type: Enums<'listing_type'>;
  price: number;
  city: string;
  locality: string | null;
  cover_image_url: string | null;
  created_at: string;
  seller_id: string;
  rejection_reason: string | null;
};

export const getModerationQueue = cache(
  async (status: Enums<'property_status'>): Promise<ModerationRow[]> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from('properties')
      .select(
        'id, title, slug, status, property_type, listing_type, price, city, locality, cover_image_url, created_at, seller_id, rejection_reason',
      )
      .eq('status', status)
      // Oldest first: a moderation queue is a queue, and the listing that has
      // waited longest is the one a seller is most likely giving up on.
      .order('created_at', { ascending: true })
      .limit(100);

    return (data ?? []) as ModerationRow[];
  },
);

// --- Reports -----------------------------------------------------------------

export type ReportRow = {
  id: string;
  property_id: string;
  reason: Enums<'report_reason'>;
  description: string | null;
  status: Enums<'report_status'>;
  admin_notes: string | null;
  created_at: string;
  resolved_at: string | null;
};

export type ReportWithProperty = ReportRow & {
  property_title: string;
  property_slug: string | null;
  property_status: Enums<'property_status'>;
  /** How many separate people have reported the same listing. */
  report_count: number;
};

export const getReports = cache(async (open: boolean): Promise<ReportWithProperty[]> => {
  const supabase = await createClient();

  const { data: reports } = await supabase
    .from('property_reports')
    .select('id, property_id, reason, description, status, admin_notes, created_at, resolved_at')
    .in('status', open ? ['open', 'under_review'] : ['resolved', 'dismissed'])
    .order('created_at', { ascending: true })
    .limit(100);

  const rows = (reports ?? []) as ReportRow[];
  if (rows.length === 0) return [];

  const propertyIds = [...new Set(rows.map((r) => r.property_id))];
  const { data: properties } = await supabase
    .from('properties')
    .select('id, title, slug, status')
    .in('id', propertyIds);

  const byId = new Map(
    (properties ?? []).map((p) => [p.id, p as { id: string; title: string; slug: string | null; status: Enums<'property_status'> }]),
  );

  // A listing three people reported is not the same as one somebody disliked.
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.property_id, (counts.get(r.property_id) ?? 0) + 1);

  return rows.map((r) => ({
    ...r,
    property_title: byId.get(r.property_id)?.title ?? 'Deleted listing',
    property_slug: byId.get(r.property_id)?.slug ?? null,
    property_status: byId.get(r.property_id)?.status ?? 'draft',
    report_count: counts.get(r.property_id) ?? 1,
  }));
});

// --- Verification ------------------------------------------------------------

export type VerificationRow = {
  id: string;
  property_id: string;
  seller_id: string;
  documents: unknown;
  note: string | null;
  status: Enums<'verification_status'>;
  admin_notes: string | null;
  created_at: string;
  property_title: string;
  property_slug: string | null;
};

export const getVerificationRequests = cache(
  async (pending: boolean): Promise<VerificationRow[]> => {
    const supabase = await createClient();

    const { data } = await supabase
      .from('verification_requests')
      .select('id, property_id, seller_id, documents, note, status, admin_notes, created_at')
      .in('status', pending ? ['pending'] : ['verified', 'rejected'])
      .order('created_at', { ascending: true })
      .limit(100);

    const rows = (data ?? []) as Omit<VerificationRow, 'property_title' | 'property_slug'>[];
    if (rows.length === 0) return [];

    const { data: properties } = await supabase
      .from('properties')
      .select('id, title, slug')
      .in('id', [...new Set(rows.map((r) => r.property_id))]);

    const byId = new Map((properties ?? []).map((p) => [p.id, p]));

    return rows.map((r) => ({
      ...r,
      property_title: byId.get(r.property_id)?.title ?? 'Deleted listing',
      property_slug: byId.get(r.property_id)?.slug ?? null,
    }));
  },
);

// --- Users -------------------------------------------------------------------

export type AdminUserRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  mobile_number: string | null;
  role: Enums<'user_role'>;
  account_status: Enums<'account_status'>;
  created_at: string;
};

// --- Posted on behalf --------------------------------------------------------

export type OnBehalfLead = {
  id: string;
  status: Enums<'lead_status'>;
  created_at: string;
  buyer_name: string | null;
  buyer_mobile: string | null;
};

export type OnBehalfListing = {
  id: string;
  title: string;
  slug: string | null;
  status: Enums<'property_status'>;
  listing_type: Enums<'listing_type'>;
  price: number;
  city: string;
  created_at: string;
  seller_id: string;
  seller_name: string | null;
  seller_mobile: string | null;
  /** The seller cannot sign in, so their enquiries need relaying by hand. */
  seller_is_placeholder: boolean;
  posted_by_name: string | null;
  leads: OnBehalfLead[];
};

/**
 * §12 — every listing an admin created for somebody else, newest first.
 *
 * The enquiries come along with it rather than behind another click, because
 * for a placeholder seller this page is the only place they exist: the buyer has
 * paid for a connection to somebody who cannot read their own inbox, and
 * somebody here has to pass it on.
 *
 * Reads `leads` directly rather than the `lead_details` view — that view pins
 * itself to `auth.uid()` as the seller, which is right for a seller's own inbox
 * and useless here.
 */
export const getOnBehalfListings = cache(async (): Promise<OnBehalfListing[]> => {
  const supabase = await createClient();

  const { data: properties } = await supabase
    .from('properties')
    .select('id, title, slug, status, listing_type, price, city, created_at, seller_id, posted_by')
    .not('posted_by', 'is', null)
    .order('created_at', { ascending: false })
    .limit(100);

  const rows = (properties ?? []) as {
    id: string;
    title: string;
    slug: string | null;
    status: Enums<'property_status'>;
    listing_type: Enums<'listing_type'>;
    price: number;
    city: string;
    created_at: string;
    seller_id: string;
    posted_by: string | null;
  }[];

  if (rows.length === 0) return [];

  const propertyIds = rows.map((r) => r.id);

  const { data: leads } = await supabase
    .from('leads')
    .select('id, property_id, buyer_id, status, created_at')
    .in('property_id', propertyIds)
    .order('created_at', { ascending: false });

  const leadRows = (leads ?? []) as {
    id: string;
    property_id: string;
    buyer_id: string;
    status: Enums<'lead_status'>;
    created_at: string;
  }[];

  // One profile read for everybody involved: the sellers, the admins who posted,
  // and the buyers behind the enquiries.
  const peopleIds = [
    ...new Set([
      ...rows.map((r) => r.seller_id),
      ...rows.map((r) => r.posted_by).filter((id): id is string => Boolean(id)),
      ...leadRows.map((l) => l.buyer_id),
    ]),
  ];

  const { data: people } = await supabase
    .from('profiles')
    .select('id, full_name, mobile_number, is_placeholder')
    .in('id', peopleIds);

  const byId = new Map(
    (people ?? []).map((p) => [
      p.id,
      p as { id: string; full_name: string | null; mobile_number: string | null; is_placeholder: boolean },
    ]),
  );

  const leadsByProperty = new Map<string, OnBehalfLead[]>();
  for (const lead of leadRows) {
    const buyer = byId.get(lead.buyer_id);
    const list = leadsByProperty.get(lead.property_id) ?? [];
    list.push({
      id: lead.id,
      status: lead.status,
      created_at: lead.created_at,
      buyer_name: buyer?.full_name ?? null,
      buyer_mobile: buyer?.mobile_number ?? null,
    });
    leadsByProperty.set(lead.property_id, list);
  }

  return rows.map((row) => {
    const seller = byId.get(row.seller_id);
    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      status: row.status,
      listing_type: row.listing_type,
      price: row.price,
      city: row.city,
      created_at: row.created_at,
      seller_id: row.seller_id,
      seller_name: seller?.full_name ?? null,
      seller_mobile: seller?.mobile_number ?? null,
      seller_is_placeholder: seller?.is_placeholder ?? false,
      posted_by_name: row.posted_by ? byId.get(row.posted_by)?.full_name ?? null : null,
      leads: leadsByProperty.get(row.id) ?? [],
    };
  });
});

export const getUsers = cache(async (search: string): Promise<AdminUserRow[]> => {
  const supabase = await createClient();

  let query = supabase
    .from('profiles')
    .select('id, full_name, email, mobile_number, role, account_status, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (search) {
    // Escaped: a comma or a parenthesis in the search box would otherwise be
    // read as PostgREST filter syntax rather than as text to look for.
    const safe = search.replace(/[,()*]/g, ' ').trim();
    if (safe) query = query.or(`full_name.ilike.%${safe}%,email.ilike.%${safe}%,mobile_number.ilike.%${safe}%`);
  }

  const { data } = await query;
  return (data ?? []) as AdminUserRow[];
});
