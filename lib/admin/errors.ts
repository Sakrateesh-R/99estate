import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

/**
 * §16 — reading the browser error log.
 *
 * Reads go through the ordinary client, so `client_errors_select_admin` is what
 * decides whether anything comes back. A non-admin gets an empty list rather
 * than an error, which is the same shape RLS gives everywhere else here.
 */

export const CLIENT_ERROR_KINDS = [
  'image_compression',
  'image_upload',
  'payment',
  'unexpected',
] as const;

export type ClientErrorRow = {
  id: string;
  kind: string;
  message: string;
  context: Record<string, unknown>;
  userAgent: string | null;
  createdAt: string;
  reporterName: string | null;
  reporterEmail: string | null;
};

export const getClientErrors = cache(async (kind: string | null, limit = 100): Promise<ClientErrorRow[]> => {
  const supabase = await createClient();

  let query = supabase
    .from('client_errors')
    .select('id, kind, message, context, user_agent, created_at, user_id')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (kind) query = query.eq('kind', kind);

  const { data } = await query;
  const rows = data ?? [];
  if (rows.length === 0) return [];

  /**
   * Names in a second read rather than a join.
   *
   * `user_id` is nulled when an account is deleted, and the error is still
   * worth reading without it — a join would be fine here but this keeps the
   * missing-reporter case obvious rather than implicit.
   */
  const ids = [...new Set(rows.map((r) => r.user_id).filter((id): id is string => Boolean(id)))];
  const byId = new Map<string, { name: string | null; email: string }>();

  if (ids.length > 0) {
    const { data: people } = await supabase.from('profiles').select('id, full_name, email').in('id', ids);
    for (const person of people ?? []) {
      byId.set(person.id, { name: person.full_name, email: person.email });
    }
  }

  return rows.map((row) => {
    const reporter = row.user_id ? byId.get(row.user_id) : undefined;
    return {
      id: row.id,
      kind: row.kind,
      message: row.message,
      context:
        row.context && typeof row.context === 'object' && !Array.isArray(row.context)
          ? (row.context as Record<string, unknown>)
          : {},
      userAgent: row.user_agent,
      createdAt: row.created_at,
      reporterName: reporter?.name ?? null,
      reporterEmail: reporter?.email ?? null,
    };
  });
});

export type ClientErrorSummary = {
  total: number;
  byKind: Record<string, number>;
};

/**
 * Counts for the filter chips.
 *
 * Tallied in JS over one capped read rather than a count per kind — four round
 * trips to label four chips is not worth the tidier query, and the table is
 * pruned to 30 days.
 */
export const summariseClientErrors = cache(async (): Promise<ClientErrorSummary> => {
  const supabase = await createClient();

  const { data } = await supabase.from('client_errors').select('kind').limit(2000);

  const byKind: Record<string, number> = {};
  for (const row of data ?? []) {
    byKind[row.kind] = (byKind[row.kind] ?? 0) + 1;
  }

  return { total: (data ?? []).length, byKind };
});
