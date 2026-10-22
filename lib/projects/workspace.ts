import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { getMyOrganizations } from '@/lib/organizations/queries';

/**
 * The company a project hangs off, resolved without asking anybody about it.
 *
 * `projects.organization_id` is NOT NULL and every project policy reaches the
 * caller's rights through it — `can_manage_project`, `can_view_project` and the
 * storage policies all resolve the organisation first. So a project cannot
 * exist without a company row, and making one optional would mean rewriting
 * those policies rather than this function.
 *
 * What the company does not have to be is something a builder fills in. Posting
 * a project should feel like posting a property: details, photos, done. So the
 * record gets created on the first project and named after its owner, and the
 * whole team/roles surface stays where it is for whoever grows into needing it.
 *
 * Nothing here is throwaway. It is a real company row, editable at
 * /dashboard/organization, and it is what the public builder page reads — so
 * somebody who later wants "Kongu Builders" instead of their own name changes
 * it in one field rather than migrating a project between companies, which the
 * guard trigger refuses anyway.
 */

export type WorkspaceResult =
  | { ok: true; organizationId: string }
  | { ok: false; error: string };

/** A sensible public name before anybody has chosen one. */
function defaultCompanyName(fullName: string | null, email: string): string {
  const named = (fullName ?? '').trim();
  if (named) return named.slice(0, 150);

  // The local part is a poor name but a better one than "Builder", and it is
  // only ever a placeholder — the slug trigger will make it unique.
  const local = email.split('@')[0]?.trim();
  return (local && local.length >= 3 ? local : 'Builder').slice(0, 150);
}

/**
 * Returns a company the caller may create projects for, making one if they have
 * none.
 *
 * Deliberately not called while rendering a page. Creating a row is a write,
 * and a GET that provisions a company for anybody who merely opens the form —
 * then abandons it — would leave empty companies behind. It runs from the
 * action, once the builder has actually submitted a project.
 */
export async function ensureProjectWorkspace(): Promise<WorkspaceResult> {
  const profile = await getProfile();
  if (!profile) return { ok: false, error: 'Your session expired. Please sign in again.' };

  /**
   * `organizations_insert_self` requires `profile_is_complete()`, so an
   * incomplete profile would fail at the database with a bare 42501. Said
   * plainly here instead.
   */
  if (!profile.is_profile_complete) {
    return { ok: false, error: 'Add your mobile number to your profile before adding a project.' };
  }

  // Reuse what they already act for. `canManage` and not merely membership:
  // creating a project is an owner/admin action, and somebody who is only a
  // sales manager somewhere needs their own company rather than a refusal.
  const existing = await getMyOrganizations();
  const manageable = existing.find((m) => m.canManage);
  if (manageable) return { ok: true, organizationId: manageable.organization.id };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('organizations')
    /**
     * Name only, and that is the whole row.
     *
     * `created_by` is not passed because the guard trigger overwrites it with
     * `auth.uid()` on insert, and `organizations_seed_owner` then reads it to
     * add the caller as owner. `slug` is not passed because a trigger derives
     * and deduplicates it from the name, which is what lets two people called
     * the same thing both have a company. Everything else has a default.
     */
    .insert({ name: defaultCompanyName(profile.full_name, profile.email) })
    .select('id')
    .maybeSingle();

  if (error || !data?.id) {
    /**
     * The one failure worth naming: the guard trigger caps a person at
     * `max_organizations_per_user` (3 by default). Somebody who is a member of
     * three companies without managing any of them lands here, and "try again"
     * would be false — they need a role, not a retry.
     */
    if (existing.length > 0) {
      return {
        ok: false,
        error:
          'You belong to companies but cannot create projects for any of them. Ask an owner for the admin role.',
      };
    }
    return { ok: false, error: 'We could not set up your project space. Please try again.' };
  }

  return { ok: true, organizationId: data.id };
}
