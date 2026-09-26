'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/session';
import type { ActionResult } from '@/lib/properties/actions';
import type { Enums } from '@/types/database.types';

/**
 * §16 — moderation actions.
 *
 * Each one calls `requireAdmin()` first, but that is the courtesy check, not
 * the real one. The authority sits in the database: `admin_approve_property`
 * and friends raise 42501 unless `is_admin()` passes, and the report and
 * profile policies restrict the rows regardless of what this file believes.
 *
 * That layering is deliberate. A Server Action is a public HTTP endpoint —
 * anyone who can reach the site can invoke one with arbitrary arguments — so
 * a check that lives only here is a check an attacker skips.
 */

function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}

/** Everything the console touches; one place to re-render after a decision. */
function revalidateAdmin() {
  revalidatePath('/admin');
  revalidatePath('/admin/properties');
  revalidatePath('/admin/reports');
  revalidatePath('/admin/verification');
  revalidatePath('/admin/users');
}

/**
 * The RPCs return `jsonb` rather than throwing for business-rule failures —
 * "this listing is not pending" is an outcome, not an exception.
 */
function readOutcome(data: unknown): { ok: boolean; code: string } {
  const result = (data ?? {}) as { ok?: boolean; code?: string };
  return { ok: Boolean(result.ok), code: result.code ?? 'unknown' };
}

// --- Listings ----------------------------------------------------------------

export async function approveProperty(propertyId: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('admin_approve_property', {
    p_property_id: propertyId,
  });
  if (error) return fail(error.message);

  const outcome = readOutcome(data);
  if (!outcome.ok) return fail(`Could not approve this listing (${outcome.code}).`);

  revalidateAdmin();
  // The listing becomes publicly visible, so the public surfaces change too.
  revalidatePath('/properties');
  revalidatePath('/');
  return { ok: true, data: undefined };
}

const reasonSchema = z
  .string()
  .trim()
  .min(10, 'Give the seller at least a sentence explaining the rejection.')
  .max(1000, 'Keep the reason under 1000 characters.');

export async function rejectProperty(propertyId: string, reason: string): Promise<ActionResult> {
  await requireAdmin();

  // A rejection reaches the seller as a notification. "Rejected" with no
  // explanation is the kind of thing that makes someone abandon the platform
  // rather than fix the listing.
  const parsed = reasonSchema.safeParse(reason);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'A reason is required.');

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_reject_property', {
    p_property_id: propertyId,
    p_reason: parsed.data,
  });
  if (error) return fail(error.message);

  const outcome = readOutcome(data);
  if (!outcome.ok) return fail(`Could not reject this listing (${outcome.code}).`);

  revalidateAdmin();
  revalidatePath('/properties');
  return { ok: true, data: undefined };
}

// --- Verification ------------------------------------------------------------

const VERIFICATION_STATUSES = ['unverified', 'pending', 'verified', 'rejected'] as const;

export async function setVerification(
  propertyId: string,
  status: Enums<'verification_status'>,
  notes?: string,
): Promise<ActionResult> {
  await requireAdmin();

  if (!(VERIFICATION_STATUSES as readonly string[]).includes(status)) {
    return fail('That is not a valid verification status.');
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_set_verification', {
    p_property_id: propertyId,
    p_status: status,
    p_notes: notes?.trim() ? notes.trim().slice(0, 1000) : undefined,
  });
  if (error) return fail(error.message);

  const outcome = readOutcome(data);
  if (!outcome.ok) return fail(`Could not update verification (${outcome.code}).`);

  revalidateAdmin();
  revalidatePath('/properties');
  return { ok: true, data: undefined };
}

// --- Reports -----------------------------------------------------------------

const REPORT_STATUSES = ['open', 'under_review', 'resolved', 'dismissed'] as const;

export async function resolveReport(
  reportId: string,
  status: Enums<'report_status'>,
  adminNotes?: string,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  if (!(REPORT_STATUSES as readonly string[]).includes(status)) {
    return fail('That is not a valid report status.');
  }

  const supabase = await createClient();

  const settled = status === 'resolved' || status === 'dismissed';

  /**
   * The reports guard waves admins through without stamping anything, so the
   * audit fields are set here — and from the server's clock and the server's
   * idea of who is signed in, never from the request.
   */
  const { data, error } = await supabase
    .from('property_reports')
    .update({
      status,
      admin_notes: adminNotes?.trim() ? adminNotes.trim().slice(0, 2000) : null,
      resolved_by: settled ? admin.id : null,
      resolved_at: settled ? new Date().toISOString() : null,
    })
    .eq('id', reportId)
    .select('id')
    .maybeSingle();

  if (error) return fail(error.message);
  if (!data) return fail('That report could not be found.');

  revalidateAdmin();
  return { ok: true, data: undefined };
}

// --- Accounts ----------------------------------------------------------------

export async function setAccountStatus(
  userId: string,
  status: Enums<'account_status'>,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  if (status !== 'active' && status !== 'suspended') {
    return fail('That is not a valid account status.');
  }

  /**
   * Suspending yourself would lock the only admin out of the console with no
   * way back in short of a SQL console. The database has no reason to object
   * — `is_admin()` is satisfied — so the check has to live here.
   */
  if (userId === admin.id) {
    return fail('You cannot change your own account status.');
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_set_account_status', {
    p_user_id: userId,
    p_status: status,
  });
  if (error) return fail(error.message);

  const outcome = readOutcome(data);
  if (!outcome.ok) return fail(`Could not update this account (${outcome.code}).`);

  revalidateAdmin();
  return { ok: true, data: undefined };
}
