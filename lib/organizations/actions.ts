'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import type { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { getMyMembership, getMyOrganizations } from '@/lib/organizations/queries';
import { organizationSchema, type OrganizationFieldName } from '@/lib/organizations/schema';
import { MAX_ORGANIZATIONS_PER_USER } from '@/lib/constants';

export type OrganizationFormState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Partial<Record<OrganizationFieldName, string>>;
};

/**
 * Pulls the company fields out of a FormData.
 *
 * `org_types` uses `getAll` because a checkbox group submits one entry per
 * checked box — `get` would silently keep only the first, so a company that is
 * a builder *and* a developer would save as just a builder.
 */
function readForm(formData: FormData) {
  return {
    name: formData.get('name') ?? '',
    org_types: formData.getAll('org_types').map(String),
    about: formData.get('about'),
    established_year: formData.get('established_year'),
    phone: formData.get('phone'),
    email: formData.get('email'),
    website: formData.get('website'),
    office_address: formData.get('office_address'),
    locality: formData.get('locality'),
    city: formData.get('city'),
    state: formData.get('state'),
    pincode: formData.get('pincode'),
    gst_number: formData.get('gst_number'),
    rera_number: formData.get('rera_number'),
  };
}

function collectFieldErrors(error: z.ZodError): OrganizationFormState['fieldErrors'] {
  const fieldErrors: OrganizationFormState['fieldErrors'] = {};
  for (const issue of error.issues) {
    const key = issue.path[0] as OrganizationFieldName | undefined;
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

/**
 * §2 — registers a company and makes the registrant its owner.
 *
 * The owner membership is not created here. A database trigger
 * (`organizations_seed_owner`) does it, because a company born without one is
 * unmanageable: every write policy resolves through `organization_members`, and
 * the row that would grant the first membership cannot be inserted by a
 * non-member. Doing it in two round trips from here would leave exactly that
 * state behind whenever the second one failed.
 *
 * Nothing sets `verification_status`. It is admin-managed, the guard trigger
 * reverts any attempt, and `is_verified` is a generated column with no writable
 * counterpart — there is deliberately no way for a company to award itself the
 * badge (§22).
 */
export async function createOrganization(
  _prevState: OrganizationFormState,
  formData: FormData,
): Promise<OrganizationFormState> {
  const profile = await getProfile();
  if (!profile) return { ok: false, error: 'Your session expired. Please sign in again.' };

  /**
   * The same gate that posting a listing has, and for the same reason: a
   * company nobody can reach is a company whose enquiries go nowhere. The
   * database requires it too, via `profile_is_complete()` in the insert policy,
   * so this is the readable version of a rule that holds either way.
   */
  if (!profile.is_profile_complete) {
    return {
      ok: false,
      error: 'Add your mobile number to your profile before registering a company.',
    };
  }

  const existing = await getMyOrganizations();
  if (existing.length >= MAX_ORGANIZATIONS_PER_USER) {
    return {
      ok: false,
      error: `You can register at most ${MAX_ORGANIZATIONS_PER_USER} companies on one account.`,
    };
  }

  const parsed = organizationSchema.safeParse(readForm(formData));
  if (!parsed.success) return { ok: false, fieldErrors: collectFieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('organizations')
    .insert(parsed.data)
    .select('id')
    .maybeSingle();

  if (error) {
    // 23505 = the unique index on `slug`. The slug trigger deduplicates with a
    // counter, so this should be unreachable; if it ever fires, retrying is the
    // honest advice rather than blaming the name.
    if (error.code === '23505') {
      return { ok: false, error: 'That company could not be registered. Please try again.' };
    }
    // 23514 = the per-account cap, re-checked in the guard trigger.
    if (error.code === '23514') {
      return {
        ok: false,
        error: `You can register at most ${MAX_ORGANIZATIONS_PER_USER} companies on one account.`,
      };
    }
    return { ok: false, error: 'We could not register your company. Please try again.' };
  }

  if (!data?.id) return { ok: false, error: 'We could not register your company. Please try again.' };

  revalidatePath('/dashboard', 'layout');
  redirect('/dashboard/organization');
}

/**
 * Company profile edits (§2). Owner or admin only.
 *
 * The role is checked here so the person gets a sentence instead of a failed
 * save, but `organizations_update_managers` is what actually refuses a viewer —
 * this check is the courtesy, not the control.
 */
export async function updateOrganization(
  _prevState: OrganizationFormState,
  formData: FormData,
): Promise<OrganizationFormState> {
  const organizationId = String(formData.get('organization_id') ?? '');
  if (!organizationId) return { ok: false, error: 'Something went wrong. Please reload the page.' };

  const membership = await getMyMembership(organizationId);
  if (!membership) return { ok: false, error: 'You do not have access to that company.' };
  if (!membership.canManage) {
    return { ok: false, error: 'Only an owner or admin can change the company profile.' };
  }

  const parsed = organizationSchema.safeParse(readForm(formData));
  if (!parsed.success) return { ok: false, fieldErrors: collectFieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase
    .from('organizations')
    .update(parsed.data)
    .eq('id', organizationId);

  if (error) {
    if (error.code === '42501') {
      return { ok: false, error: 'Only an owner or admin can change the company profile.' };
    }
    return { ok: false, error: 'We could not save your changes. Please try again.' };
  }

  revalidatePath('/dashboard/organization');
  // The public builder page renders from the same row.
  revalidatePath(`/builders/${membership.organization.slug}`);
  return { ok: true };
}

/**
 * Changing a colleague's role is deliberately not here yet.
 *
 * It was written, and then removed: there is no way to *add* a colleague until
 * an invitation flow exists, so a role-change action could only ever act on a
 * team of one — and the database refuses a self-change anyway
 * (`organization_members_guard_write`), so every call would have been rejected.
 *
 * `scripts/verify-builder-forms.mts` is what caught it. The action read
 * `member_id` and `role` out of a FormData that no form on the site submits,
 * which is the signature of an exported Server Action nothing can reach. It
 * comes back with the invitation flow, along with the UI that calls it.
 */
