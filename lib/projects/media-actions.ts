'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getMyProject } from '@/lib/projects/queries';
import { parseVideoUrl } from '@/lib/properties/video';
import {
  MAX_MEDIA_PER_PROJECT,
  MAX_PROJECT_IMAGE_BYTES,
} from '@/lib/projects/schema';

/**
 * §9 — project photos and the video link.
 *
 * The read half of this has been live for a while: the public project page
 * renders a gallery from `project_media` and every project card reads
 * `projects.cover_image_url`, which a trigger keeps in step. What was missing
 * was any way for a builder to put something there. This is that.
 *
 * Shaped after `lib/properties/image-actions.ts` on purpose — same
 * browser-uploads-then-registers split, same "re-derive the public URL rather
 * than accept one" rule, same row-before-object delete order. A builder's
 * photos should not behave differently from a seller's for no reason.
 *
 * NOTE: every export here is an async function. A `'use server'` module may
 * export nothing else — a single constant in one of these files took down
 * every action in it and 500'd step 3 of the posting wizard for every seller.
 * The limits this file needs live in `lib/projects/schema.ts`.
 */

const BUCKET = 'project-media';

type Result<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function fail(error: string): Result<never> {
  return { ok: false, error };
}

export type ProjectMediaItem = {
  id: string;
  type: string;
  url: string;
  storagePath: string | null;
  sortOrder: number;
  isCover: boolean;
};

/**
 * Marketing rights, resolved the way the rest of the project surface resolves
 * them.
 *
 * RLS enforces this independently — `project_media_write` defers to
 * `can_manage_project()`, and the storage policies check the same thing from
 * the object key — so this is about returning a sentence a builder can act on
 * instead of an empty result.
 */
async function requireMarketing(projectId: string) {
  const project = await getMyProject(projectId);
  if (!project) return { ok: false as const, error: 'That project could not be found.' };
  if (!project.canManageMarketing) {
    return {
      ok: false as const,
      error: `You need the marketing role at ${project.organizationName} to change this project's media.`,
    };
  }
  return { ok: true as const, project };
}

function revalidateProject(projectId: string, slug: string | null) {
  revalidatePath(`/dashboard/projects/${projectId}/edit`);
  revalidatePath('/dashboard/projects');
  // The gallery and the card both read from this, so a builder who adds a
  // photo and then opens the public page should see it.
  if (slug) revalidatePath(`/projects/${slug}`);
  revalidatePath('/projects');
}

/** Everything attached to a project, in the order the gallery shows it. */
export async function listProjectMedia(projectId: string): Promise<ProjectMediaItem[]> {
  const allowed = await requireMarketing(projectId);
  if (!allowed.ok) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from('project_media')
    .select('id, type, url, storage_path, sort_order')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  return (data ?? []).map((row) => ({
    id: row.id,
    type: row.type,
    url: row.url,
    storagePath: row.storage_path,
    sortOrder: row.sort_order,
    isCover: row.type === 'cover',
  }));
}

/**
 * Records an image the browser has already put in the bucket.
 *
 * The bytes never pass through Next: the storage policy authorises the upload
 * from the object key via `storage_path_project_id()`, so a builder's 40 photos
 * do not become 40 server round-trips carrying megabytes each.
 */
export async function registerProjectImage(
  projectId: string,
  storagePath: string,
  meta: { width?: number; height?: number; byteSize?: number } = {},
): Promise<Result<ProjectMediaItem>> {
  const allowed = await requireMarketing(projectId);
  if (!allowed.ok) return fail(allowed.error);

  // The same shape `project_media_storage_path_check` enforces. Checked here
  // too so a mistake reads as a sentence rather than a constraint violation.
  const expectedPrefix = `projects/${projectId}/`;
  if (!storagePath.startsWith(expectedPrefix) || storagePath.includes('..')) {
    return fail('That upload path is not valid for this project.');
  }
  if (meta.byteSize && meta.byteSize > MAX_PROJECT_IMAGE_BYTES) {
    return fail('Images must be 10 MB or smaller.');
  }

  const supabase = await createClient();

  const { count } = await supabase
    .from('project_media')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId);

  if ((count ?? 0) >= MAX_MEDIA_PER_PROJECT) {
    return fail(`A project can have at most ${MAX_MEDIA_PER_PROJECT} media items.`);
  }

  // Re-derived, never taken from the client: the URL is what the public page
  // renders and what the cover trigger copies onto the project card.
  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);

  const { data, error } = await supabase
    .from('project_media')
    .insert({
      project_id: projectId,
      type: 'gallery',
      storage_path: storagePath,
      url: publicUrl,
      sort_order: Math.min(count ?? 0, 200),
      width: meta.width ?? null,
      height: meta.height ?? null,
      byte_size: meta.byteSize ?? null,
    })
    .select('id, type, url, storage_path, sort_order')
    .single();

  if (error) {
    // The object is orphaned if the row failed — clear it rather than leaving
    // unreferenced bytes in the bucket.
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return fail(error.message);
  }

  revalidateProject(projectId, allowed.project.slug);

  return {
    ok: true,
    data: {
      id: data.id,
      type: data.type,
      url: data.url,
      storagePath: data.storage_path,
      sortOrder: data.sort_order,
      isCover: data.type === 'cover',
    },
  };
}

export async function deleteProjectMedia(projectId: string, mediaId: string): Promise<Result> {
  const allowed = await requireMarketing(projectId);
  if (!allowed.ok) return fail(allowed.error);

  const supabase = await createClient();

  const { data: item } = await supabase
    .from('project_media')
    .select('storage_path')
    .eq('id', mediaId)
    .eq('project_id', projectId)
    .maybeSingle();

  if (!item) return fail('That item has already been removed.');

  const { error } = await supabase
    .from('project_media')
    .delete()
    .eq('id', mediaId)
    .eq('project_id', projectId);

  if (error) return fail(error.message);

  // Row first, object second: an orphaned object is harmless, a row pointing at
  // a deleted object renders a broken image. A video row has no object at all.
  if (item.storage_path) {
    await supabase.storage.from(BUCKET).remove([item.storage_path]);
  }

  revalidateProject(projectId, allowed.project.slug);
  return { ok: true, data: undefined };
}

/**
 * Promotes one image to cover.
 *
 * Cover is a `type`, not a flag: `project_media_sync_cover_url()` picks the row
 * with `type = 'cover'` and falls back to the first gallery image by sort
 * order. So this demotes the incumbent to `gallery` and promotes the chosen
 * row — two statements, and the trigger mirrors the result onto
 * `projects.cover_image_url` by itself.
 */
export async function setProjectCover(projectId: string, mediaId: string): Promise<Result> {
  const allowed = await requireMarketing(projectId);
  if (!allowed.ok) return fail(allowed.error);

  const supabase = await createClient();

  const { error: demoteError } = await supabase
    .from('project_media')
    .update({ type: 'gallery' })
    .eq('project_id', projectId)
    .eq('type', 'cover');

  if (demoteError) return fail(demoteError.message);

  // Guarded to gallery/cover so this can never retype a brochure or a video
  // row into the gallery by way of a stale id.
  const { data, error } = await supabase
    .from('project_media')
    .update({ type: 'cover' })
    .eq('id', mediaId)
    .eq('project_id', projectId)
    .in('type', ['gallery', 'cover'])
    .select('id')
    .maybeSingle();

  if (error) return fail(error.message);
  if (!data) return fail('That image is no longer part of this project.');

  revalidateProject(projectId, allowed.project.slug);
  return { ok: true, data: undefined };
}

/** Persists a drag-and-drop reorder, which also decides the fallback cover. */
export async function reorderProjectMedia(
  projectId: string,
  orderedIds: string[],
): Promise<Result> {
  const allowed = await requireMarketing(projectId);
  if (!allowed.ok) return fail(allowed.error);

  if (orderedIds.length > MAX_MEDIA_PER_PROJECT) return fail('Too many items.');

  const supabase = await createClient();

  const { data: owned } = await supabase
    .from('project_media')
    .select('id')
    .eq('project_id', projectId);

  const valid = new Set((owned ?? []).map((r) => r.id));
  if (orderedIds.some((id) => !valid.has(id))) {
    return fail('That item does not belong to this project.');
  }

  const results = await Promise.all(
    orderedIds.map((id, index) =>
      supabase
        .from('project_media')
        .update({ sort_order: index })
        .eq('id', id)
        .eq('project_id', projectId),
    ),
  );

  const firstError = results.find((r) => r.error)?.error;
  if (firstError) return fail(firstError.message);

  revalidateProject(projectId, allowed.project.slug);
  return { ok: true, data: undefined };
}

/**
 * Sets, replaces or clears the project's video link.
 *
 * One video per project, kept as a single `type = 'video'` row. Nothing is
 * uploaded — `storage_path` stays NULL, which the table documents as the
 * deliberate choice for video, because egress is the cost that bites there.
 *
 * What gets stored is `canonicalUrl`, rebuilt from a parsed video id rather
 * than kept as typed. `project_media.url` has no provider allowlist of its own
 * (unlike `properties.video_url`, which repeats the rule as a CHECK), so this
 * function is the only thing standing between a pasted string and an
 * `<iframe src>` on a page carrying our name. Storing a rebuilt id-based URL
 * makes a redirect or a second host in the string unrepresentable.
 */
export async function setProjectVideo(projectId: string, rawUrl: string): Promise<Result> {
  const allowed = await requireMarketing(projectId);
  if (!allowed.ok) return fail(allowed.error);

  const supabase = await createClient();
  const trimmed = (rawUrl ?? '').trim();

  if (trimmed === '') {
    const { error } = await supabase
      .from('project_media')
      .delete()
      .eq('project_id', projectId)
      .eq('type', 'video');

    if (error) return fail(error.message);

    revalidateProject(projectId, allowed.project.slug);
    return { ok: true, data: undefined };
  }

  const parsed = parseVideoUrl(trimmed);
  if (!parsed) {
    return fail('Paste a YouTube or Vimeo link. Nothing else can be embedded.');
  }

  // Replace rather than upsert: there is no unique constraint on
  // (project_id, type), so clearing first is what keeps this to one video.
  const { error: clearError } = await supabase
    .from('project_media')
    .delete()
    .eq('project_id', projectId)
    .eq('type', 'video');

  if (clearError) return fail(clearError.message);

  const { error } = await supabase.from('project_media').insert({
    project_id: projectId,
    type: 'video',
    storage_path: null,
    url: parsed.canonicalUrl,
    // Sorted last so it never becomes the fallback cover. The trigger only
    // considers cover/gallery rows, but a video sitting at 0 would still push
    // every photo down by one.
    sort_order: 200,
  });

  if (error) return fail(error.message);

  revalidateProject(projectId, allowed.project.slug);
  return { ok: true, data: undefined };
}
