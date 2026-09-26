import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
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
};

export const getQueueCounts = cache(async (): Promise<QueueCounts> => {
  const supabase = await createClient();

  // `head: true` so each of these is a COUNT and never ships rows.
  const [pending, reports, verifications, suspended, users, live] = await Promise.all([
    supabase.from('properties').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('property_reports').select('*', { count: 'exact', head: true }).in('status', ['open', 'under_review']),
    supabase.from('verification_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('account_status', 'suspended'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('properties').select('*', { count: 'exact', head: true }).eq('status', 'published'),
  ]);

  return {
    pendingProperties: pending.count ?? 0,
    openReports: reports.count ?? 0,
    pendingVerifications: verifications.count ?? 0,
    suspendedUsers: suspended.count ?? 0,
    totalUsers: users.count ?? 0,
    liveProperties: live.count ?? 0,
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
