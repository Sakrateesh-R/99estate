'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getUser } from '@/lib/auth/session';
import type { ActionResult } from '@/lib/properties/actions';
import type { Enums } from '@/types/database.types';

/**
 * §15 — the only two things a seller may change on a lead.
 *
 * Both write to `leads` rather than the view, and neither passes `seller_id`.
 * Ownership is decided twice underneath: the RLS policy restricts the row set
 * to the caller's own leads, and `leads_guard_write` rejects any attempt to
 * move a lead between people or listings. So nothing here needs to be trusted
 * with who owns what — it only needs to not get in the way.
 */

const LEAD_STATUSES = [
  'new',
  'contacted',
  'interested',
  'site_visit',
  'negotiation',
  'closed',
  'not_interested',
] as const;

const statusSchema = z.enum(LEAD_STATUSES);
// Matches the leads_notes_check constraint, so an over-long note fails here
// with a readable message rather than as a database error.
const notesSchema = z.string().trim().max(2000, 'Notes cannot be longer than 2000 characters.');

export async function updateLeadStatus(
  leadId: string,
  status: Enums<'lead_status'>,
): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: 'Your session expired. Please sign in again.' };

  const parsed = statusSchema.safeParse(status);
  if (!parsed.success) return { ok: false, error: 'That is not a valid lead status.' };

  const supabase = await createClient();

  // `last_status_change_at` is stamped by the guard trigger, not here — the
  // client must not be able to decide when something happened.
  const { data, error } = await supabase
    .from('leads')
    .update({ status: parsed.data })
    .eq('id', leadId)
    .select('id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  // RLS filters rather than errors, so "no row" is what a lead belonging to
  // somebody else looks like from here.
  if (!data) return { ok: false, error: 'That enquiry could not be found.' };

  revalidatePath('/dashboard/leads');
  return { ok: true, data: undefined };
}

export async function updateLeadNotes(leadId: string, notes: string): Promise<ActionResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: 'Your session expired. Please sign in again.' };

  const parsed = notesSchema.safeParse(notes);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Those notes could not be saved.' };
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('leads')
    // Empty clears the note rather than storing a blank string, so "has a
    // note" stays a meaningful thing to check.
    .update({ notes: parsed.data.length > 0 ? parsed.data : null })
    .eq('id', leadId)
    .select('id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'That enquiry could not be found.' };

  revalidatePath('/dashboard/leads');
  return { ok: true, data: undefined };
}
