'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { getMyMembership, getMyOrganizations } from '@/lib/organizations/queries';
import { organizationSchema, type OrganizationFieldName } from '@/lib/organizations/schema';
import { MAX_ORGANIZATIONS_PER_USER } from '@/lib/constants';
import type { Enums } from '@/types/database.types';

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

// ---------------------------------------------------------------------------
// The team (§3)
// ---------------------------------------------------------------------------

export type TeamActionState = { ok: boolean; error?: string; message?: string };

/** Roles an invitation may carry. `owner` is absent on purpose — see below. */
const INVITABLE_ROLES = ['admin', 'sales_manager', 'sales_executive', 'marketing', 'viewer'] as const;

const inviteSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Enter a valid email address')
    .max(200, 'That address is too long'),
  /**
   * Not `owner`. `organization_invitations_role_check` refuses it in the
   * database too: ownership of a company is transferred deliberately by an
   * existing owner, not handed out in a form where one mistyped address would
   * give the business away.
   */
  role: z.enum(INVITABLE_ROLES, {
    errorMap: () => ({ message: 'Choose what this person should be able to do' }),
  }),
});

/**
 * Invites a colleague by email address.
 *
 * It does not send anything, because there is no mailer in this project. The
 * row sits and waits, and `accept_pending_invitations()` turns it into a
 * membership the moment that person signs in with Google on that address — the
 * auth callback calls it. So the sender's next step is to tell them to sign in,
 * which the UI says plainly rather than implying.
 */
export async function inviteMember(
  _prevState: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  const organizationId = String(formData.get('organization_id') ?? '');
  if (!organizationId) return { ok: false, error: 'Something went wrong. Please reload the page.' };

  const membership = await getMyMembership(organizationId);
  if (!membership?.canManage) {
    return { ok: false, error: 'Only an owner or admin can invite a colleague.' };
  }

  const parsed = inviteSchema.safeParse({
    email: formData.get('email') ?? '',
    role: formData.get('role') ?? '',
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the details and try again.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('organization_invitations').insert({
    organization_id: organizationId,
    email: parsed.data.email,
    role: parsed.data.role,
  });

  if (error) {
    // 23505 covers both the one-pending-per-address index and the guard's
    // "already on the team", which are the same thing from the sender's side.
    if (error.code === '23505') {
      return {
        ok: false,
        error: error.message.includes('already on the team')
          ? 'That person is already on your team.'
          : 'You have already invited that address.',
      };
    }
    if (error.code === '23514') {
      return { ok: false, error: 'You have too many invitations outstanding. Withdraw one first.' };
    }
    if (error.code === '42501') {
      return { ok: false, error: 'Only an owner or admin can invite a colleague.' };
    }
    return { ok: false, error: 'We could not record that invitation. Please try again.' };
  }

  revalidatePath('/dashboard/organization');
  return {
    ok: true,
    message: `${parsed.data.email} can join by signing in with Google on that address.`,
  };
}

/** Withdraws an invitation that has not been taken up. */
export async function revokeInvitation(formData: FormData): Promise<TeamActionState> {
  const organizationId = String(formData.get('organization_id') ?? '');
  const invitationId = String(formData.get('invitation_id') ?? '');
  if (!organizationId || !invitationId) {
    return { ok: false, error: 'Something went wrong. Please reload the page.' };
  }

  const membership = await getMyMembership(organizationId);
  if (!membership?.canManage) {
    return { ok: false, error: 'Only an owner or admin can withdraw an invitation.' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('organization_invitations')
    .update({ status: 'revoked' })
    .eq('id', invitationId)
    .eq('organization_id', organizationId);

  if (error) return { ok: false, error: 'We could not withdraw that invitation. Please try again.' };

  revalidatePath('/dashboard/organization');
  return { ok: true, message: 'Invitation withdrawn.' };
}

/**
 * Changes a colleague's role.
 *
 * Never your own: `organization_members_guard_write` raises on a self-change,
 * which is what stops somebody promoting themselves to owner. A separate
 * constraint trigger refuses to leave the company without an active owner, so
 * demoting the last one fails at the database even if this check is bypassed.
 */
export async function updateMemberRole(formData: FormData): Promise<TeamActionState> {
  const organizationId = String(formData.get('organization_id') ?? '');
  const memberId = String(formData.get('member_id') ?? '');
  const role = String(formData.get('role') ?? '');

  if (!organizationId || !memberId || !role) {
    return { ok: false, error: 'Something went wrong. Please reload the page.' };
  }

  const membership = await getMyMembership(organizationId);
  if (!membership?.canManage) return { ok: false, error: 'Only an owner or admin can change roles.' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('organization_members')
    .update({ role: role as Enums<'org_member_role'> })
    .eq('id', memberId)
    .eq('organization_id', organizationId);

  if (error) {
    if (error.code === '42501') {
      return {
        ok: false,
        error: error.message.includes('your own')
          ? 'You cannot change your own role. Ask another owner to do it.'
          : 'Only an owner or admin can change roles.',
      };
    }
    if (error.code === '23514') {
      return { ok: false, error: 'A company has to keep at least one active owner.' };
    }
    return { ok: false, error: 'We could not change that role. Please try again.' };
  }

  revalidatePath('/dashboard/organization');
  return { ok: true, message: 'Role updated.' };
}

/**
 * Removes a colleague, or yourself.
 *
 * The row count is checked rather than only the error, because this is exactly
 * where migration 032 bites: `organization_members_guard_write` returned NEW on
 * its trusted-writer path, which is NULL during a DELETE and cancels the row
 * *silently*. An owner acting on their own company reaches a correct
 * `return old` and is unaffected; a platform admin is not. Reporting success
 * for a delete that changed nothing is the one outcome worth refusing.
 */
export async function removeMember(formData: FormData): Promise<TeamActionState> {
  const organizationId = String(formData.get('organization_id') ?? '');
  const memberId = String(formData.get('member_id') ?? '');
  if (!organizationId || !memberId) {
    return { ok: false, error: 'Something went wrong. Please reload the page.' };
  }

  const membership = await getMyMembership(organizationId);
  if (!membership) return { ok: false, error: 'You do not have access to that company.' };

  const supabase = await createClient();
  const { data: target } = await supabase
    .from('organization_members')
    .select('id, user_id')
    .eq('id', memberId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (!target) return { ok: false, error: 'That person is not on this team.' };

  const profile = await getProfile();
  const isSelf = target.user_id === profile?.id;
  if (!isSelf && !membership.canManage) {
    return { ok: false, error: 'Only an owner or admin can remove a team member.' };
  }

  const { error } = await supabase
    .from('organization_members')
    .delete()
    .eq('id', memberId)
    .eq('organization_id', organizationId);

  if (error) {
    if (error.code === '42501') {
      return { ok: false, error: 'Only an owner or admin can remove a team member.' };
    }
    if (error.code === '23514') {
      return { ok: false, error: 'A company has to keep at least one active owner.' };
    }
    return { ok: false, error: 'We could not remove that person. Please try again.' };
  }

  const { count } = await supabase
    .from('organization_members')
    .select('id', { count: 'exact', head: true })
    .eq('id', memberId);

  if (count !== 0) {
    return {
      ok: false,
      error: 'That did not take effect — the database still needs migration 032 applied.',
    };
  }

  revalidatePath('/dashboard', 'layout');
  return { ok: true, message: isSelf ? 'You have left the company.' : 'Team member removed.' };
}
