import { reportClientError } from '@/lib/diagnostics/actions';
import { optimiseImage } from '@/lib/images/optimise';
import { createClient } from '@/lib/supabase/client';
import { registerProjectImage, type ProjectMediaItem } from '@/lib/projects/media-actions';
import {
  MAX_PROJECT_IMAGE_BYTES,
  PROJECT_IMAGE_MIME_TYPES,
  type ProjectUploadType,
} from '@/lib/projects/schema';

/**
 * One image, from a file input to a `project_media` row.
 *
 * Extracted when plans needed the same four steps the gallery already did —
 * shrink in the browser, put the bytes in the bucket, register the row, report
 * a compression failure without blocking the upload. The two uploaders differ
 * only in which `type` they write and whether they ask for a caption, which is
 * not enough to justify a second copy of the sequence that ends in a paid
 * bucket.
 *
 * Runs in the browser: `createClient()` here is the anon client, and the
 * storage policy authorises the write from the object key. Nothing in this file
 * is a server action; `registerProjectImage` is the one call that crosses over.
 */

const BUCKET = 'project-media';

export type UploadOutcome =
  | { ok: true; item: ProjectMediaItem }
  | { ok: false; error: string };

/** Rejects a file before any of it is uploaded. Null means it is acceptable. */
export function rejectReason(file: File): string | null {
  if (!PROJECT_IMAGE_MIME_TYPES.includes(file.type as (typeof PROJECT_IMAGE_MIME_TYPES)[number])) {
    return 'Use JPG, PNG, WebP or AVIF.';
  }
  /**
   * Four times the bucket limit, deliberately.
   *
   * `optimiseImage` is about to shrink this, and a 30 MB phone photo lands well
   * under 10 MB once it does. The bucket's own limit is what actually applies
   * to the bytes that get sent; this only catches the absurd.
   */
  if (file.size > MAX_PROJECT_IMAGE_BYTES * 4) {
    return 'Please pick an image under 40 MB.';
  }
  return null;
}

export async function uploadProjectImage({
  projectId,
  file,
  type,
  title,
}: {
  projectId: string;
  file: File;
  type: ProjectUploadType;
  title?: string;
}): Promise<UploadOutcome> {
  try {
    const { blob, width, height, ext, failure } = await optimiseImage(file);

    /**
     * Report, then carry on uploading. The builder gets their image either way
     * — they are not the person who needs to know the canvas gave up, and
     * there is nothing they could do about it. Silence here is what hid "one
     * photo in ten stored uncompressed" for weeks.
     */
    if (failure) {
      void reportClientError({
        kind: 'image_compression',
        message: `Could not compress ${file.name}: ${failure.reason}`,
        context: {
          reason: failure.reason,
          detail: failure.detail,
          fileType: file.type || '(none)',
          fileBytes: file.size,
          storedBytes: blob.size,
          extension: ext,
          projectId,
          mediaType: type,
        },
      });
    }

    const supabase = createClient();
    const path = `projects/${projectId}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, { contentType: blob.type || file.type, upsert: false });

    if (uploadError) return { ok: false, error: uploadError.message };

    const result = await registerProjectImage(projectId, path, {
      width: width || undefined,
      height: height || undefined,
      byteSize: blob.size,
      type,
      title,
    });

    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, item: result.data };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'That upload failed.' };
  }
}
