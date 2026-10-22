'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import type { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { getMyMembership } from '@/lib/organizations/queries';
import { getMyProject } from '@/lib/projects/queries';
import { projectSchema, type ProjectFieldName } from '@/lib/projects/schema';

export type ProjectFormState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Partial<Record<ProjectFieldName, string>>;
};

function readForm(formData: FormData) {
  return {
    organization_id: String(formData.get('organization_id') ?? ''),
    name: formData.get('name') ?? '',
    project_type: formData.get('project_type') ?? '',
    status: formData.get('status'),
    project_code: formData.get('project_code'),
    description: formData.get('description'),
    city: formData.get('city') ?? '',
    locality: formData.get('locality'),
    district: formData.get('district'),
    state: formData.get('state'),
    address: formData.get('address'),
    pincode: formData.get('pincode'),
    map_url: formData.get('map_url'),
    total_area: formData.get('total_area'),
    total_area_unit: formData.get('total_area_unit'),
    total_units: formData.get('total_units'),
    price_min: formData.get('price_min'),
    price_max: formData.get('price_max'),
    // Checkbox group — `get` would keep only "2 BHK" from "2 & 3 BHK".
    bedroom_options: formData.getAll('bedroom_options').map(String),
    launch_date: formData.get('launch_date'),
    expected_completion_date: formData.get('expected_completion_date'),
    construction_progress_percentage: formData.get('construction_progress_percentage'),
    construction_progress_note: formData.get('construction_progress_note'),
    rera_number: formData.get('rera_number'),
  };
}

function collectFieldErrors(error: z.ZodError): ProjectFormState['fieldErrors'] {
  const fieldErrors: ProjectFormState['fieldErrors'] = {};
  for (const issue of error.issues) {
    const key = issue.path[0] as ProjectFieldName | undefined;
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

/**
 * Maps a database error to a sentence.
 *
 * Shared by create and update because both hit the same constraints, and
 * because the project-code message is the one a builder will actually see:
 * `projects_org_code_idx` is unique per company, so two phases both called
 * "PHASE-1" collide.
 */
function describe(error: { code: string; message: string }, action: 'create' | 'save'): string {
  if (error.code === '23505') {
    return error.message.includes('project_code') || error.message.includes('org_code')
      ? 'Another project in this company already uses that project code.'
      : `We could not ${action} this project. Please try again.`;
  }
  if (error.code === '42501') {
    return action === 'create'
      ? 'Only an owner or admin of the company can create a project.'
      : 'You do not have permission to change this project.';
  }
  if (error.code === '23514') {
    return 'Some of those values are outside the allowed range. Please check and try again.';
  }
  return `We could not ${action} this project. Please try again.`;
}

/**
 * §5 — creates a project. Owner or admin of the company only.
 *
 * Created unpublished, always. Publication is a separate, deliberate act
 * (`setProjectPublished` below) because a half-filled project appearing on the
 * public site the moment it is named is nobody's intention.
 */
export async function createProject(
  _prevState: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const profile = await getProfile();
  if (!profile) return { ok: false, error: 'Your session expired. Please sign in again.' };
  if (!profile.is_profile_complete) {
    return { ok: false, error: 'Add your mobile number to your profile before creating a project.' };
  }

  const parsed = projectSchema.safeParse(readForm(formData));
  if (!parsed.success) return { ok: false, fieldErrors: collectFieldErrors(parsed.error) };

  const membership = await getMyMembership(parsed.data.organization_id);
  if (!membership) return { ok: false, error: 'You do not act for that company.' };
  if (!membership.canManage) {
    return { ok: false, error: 'Only an owner or admin of the company can create a project.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('projects')
    .insert(parsed.data)
    .select('id')
    .maybeSingle();

  if (error) return { ok: false, error: describe(error, 'create') };
  if (!data?.id) return { ok: false, error: 'We could not create this project. Please try again.' };

  revalidatePath('/dashboard/projects');
  redirect(`/dashboard/projects/${data.id}/edit`);
}

/**
 * Project edits. Marketing role and above (§3).
 *
 * `organization_id` is read off the stored row rather than the form. The guard
 * trigger refuses to move a project between companies anyway, but taking it
 * from the submission would mean a tampered field decided which company's
 * permissions were checked.
 */
export async function updateProject(
  _prevState: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const projectId = String(formData.get('project_id') ?? '');
  if (!projectId) return { ok: false, error: 'Something went wrong. Please reload the page.' };

  const existing = await getMyProject(projectId);
  if (!existing) return { ok: false, error: 'That project could not be found.' };
  if (!existing.canManageMarketing) {
    return { ok: false, error: 'You do not have permission to change this project.' };
  }

  const parsed = projectSchema.safeParse({
    ...readForm(formData),
    organization_id: existing.organization_id,
  });
  if (!parsed.success) return { ok: false, fieldErrors: collectFieldErrors(parsed.error) };

  // Pinned by the guard trigger too; omitting it keeps the UPDATE honest about
  // what it is actually changing.
  const { organization_id: _ignored, ...changes } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from('projects').update(changes).eq('id', projectId);

  if (error) return { ok: false, error: describe(error, 'save') };

  revalidatePath('/dashboard/projects');
  revalidatePath(`/dashboard/projects/${projectId}/edit`);
  revalidatePath(`/projects/${existing.slug}`);
  return { ok: true };
}

export type PublishState = { ok: boolean; error?: string; published?: boolean };

/**
 * Takes a project on or off the public site.
 *
 * `published_at` is not set here — the guard trigger stamps it the first time
 * `is_published` becomes true, and leaves it alone afterwards. That matters
 * because unpublishing and republishing must not look like a brand new project
 * to anything ordering by it.
 *
 * Note there is no expiry to worry about. §18 keeps a completed, sold-out
 * project public, so unlike a listing this decision is only ever the builder's.
 */
export async function setProjectPublished(formData: FormData): Promise<PublishState> {
  const projectId = String(formData.get('project_id') ?? '');
  const next = String(formData.get('published') ?? '') === 'true';
  if (!projectId) return { ok: false, error: 'Something went wrong. Please reload the page.' };

  const existing = await getMyProject(projectId);
  if (!existing) return { ok: false, error: 'That project could not be found.' };
  if (!existing.canManageMarketing) {
    return { ok: false, error: 'You do not have permission to change this project.' };
  }

  /**
   * A suspended company's projects stay down. `admin_verify_organization`
   * already unpublishes them and `project_is_live` hides them, so letting the
   * button appear to work would be a lie told to somebody who cannot fix it
   * themselves.
   */
  if (next && existing.verification_status === 'suspended') {
    return { ok: false, error: 'This project is suspended. Contact 99Estate to resolve it.' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('projects')
    .update({ is_published: next })
    .eq('id', projectId);

  if (error) {
    if (error.code === '42501') {
      return { ok: false, error: 'You do not have permission to change this project.' };
    }
    return { ok: false, error: 'We could not change that. Please try again.' };
  }

  revalidatePath('/dashboard/projects');
  revalidatePath(`/dashboard/projects/${projectId}/edit`);
  return { ok: true, published: next };
}

/**
 * Deletes a project. Owner or admin only (`projects_delete_managers`).
 *
 * The cascade takes its media, amenities, buildings, floors, inventory and the
 * enquiries raised against it, which is why the dialog in front of this says so
 * in those words. An individual listing attached to the project survives —
 * `properties.project_id` is ON DELETE SET NULL, so the listing simply stops
 * being part of a project rather than disappearing with it.
 */
export async function deleteProject(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const projectId = String(formData.get('project_id') ?? '');
  if (!projectId) return { ok: false, error: 'Something went wrong. Please reload the page.' };

  const existing = await getMyProject(projectId);
  if (!existing) return { ok: false, error: 'That project could not be found.' };

  const membership = await getMyMembership(existing.organization_id);
  if (!membership?.canManage) {
    return { ok: false, error: 'Only an owner or admin can delete a project.' };
  }

  const supabase = await createClient();

  /**
   * Clear the bucket before the row goes, and in that order for two reasons.
   *
   * The obvious one is the same as `deleteProperty`'s: deleting the project
   * cascades `project_media` away and takes the only record of what is in the
   * bucket with it.
   *
   * The one that actually bites is authorisation. The storage policy
   * `project_media_delete` defers to `can_manage_project()`, which resolves the
   * organisation through `project_org_id()` — a lookup on the project row. With
   * the project already deleted that returns NULL, the check fails, and the
   * removal is refused. Not loudly: `remove()` reports a per-object failure
   * that is easy to discard, so the photos simply stay in `project-media`
   * forever — unreferenced, unreachable and still billed. This was written the
   * other way round first and that is exactly what happened.
   *
   * `storage_path` is NULL for a video row, which is linked rather than hosted,
   * so those are filtered out instead of sending nulls to `remove()`.
   */
  const { data: media } = await supabase
    .from('project_media')
    .select('storage_path')
    .eq('project_id', projectId);

  const paths = (media ?? [])
    .map((m) => m.storage_path)
    .filter((path): path is string => Boolean(path));

  if (paths.length) {
    await supabase.storage.from('project-media').remove(paths);
  }

  const { error } = await supabase.from('projects').delete().eq('id', projectId);

  if (error) {
    if (error.code === '42501') {
      return { ok: false, error: 'Only an owner or admin can delete a project.' };
    }
    return { ok: false, error: 'We could not delete that project. Please try again.' };
  }

  revalidatePath('/dashboard/projects');
  redirect('/dashboard/projects');
}
