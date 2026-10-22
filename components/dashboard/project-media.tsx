'use client';

import * as React from 'react';
import Image from 'next/image';
import { CheckCircle2, GripVertical, ImageUp, Loader2, Star, Trash2, Video } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { reportClientError } from '@/lib/diagnostics/actions';
import { optimiseImage } from '@/lib/images/optimise';
import { createClient } from '@/lib/supabase/client';
import {
  deleteProjectMedia,
  registerProjectImage,
  reorderProjectMedia,
  setProjectCover,
  setProjectVideo,
  type ProjectMediaItem,
} from '@/lib/projects/media-actions';
import {
  MAX_MEDIA_PER_PROJECT,
  MAX_PROJECT_IMAGE_BYTES,
  PROJECT_IMAGE_MIME_TYPES,
} from '@/lib/projects/schema';
import { parseVideoUrl, VIDEO_PROVIDER_LABELS } from '@/lib/properties/video';

const BUCKET = 'project-media';

type Item = ProjectMediaItem & { pending?: boolean; localUrl?: string };

/**
 * §9 — photos and the video link for a project.
 *
 * The seller's uploader and this one do the same job, and the parts worth
 * getting right are shared rather than copied: `optimiseImage` for the
 * downscale, `parseVideoUrl` for the provider allowlist. What differs is only
 * what the project schema actually models — cover is a `type` here rather than
 * a boolean, and the video lives in the same table as the photos instead of a
 * column on the parent.
 */
export function ProjectMedia({
  projectId,
  initialMedia,
  initialVideoUrl,
  readOnly = false,
}: {
  projectId: string;
  initialMedia: ProjectMediaItem[];
  initialVideoUrl: string;
  readOnly?: boolean;
}) {
  const toast = useToast();
  const [items, setItems] = React.useState<Item[]>(initialMedia);
  const [busy, setBusy] = React.useState(false);
  const [dragOver, setDragOver] = React.useState(false);
  const dragIndex = React.useRef<number | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const images = items.filter((i) => i.type === 'cover' || i.type === 'gallery' || i.pending);

  const handleFiles = React.useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      const room = MAX_MEDIA_PER_PROJECT - items.length;

      if (room <= 0) {
        toast({ tone: 'warning', title: `This project already has ${MAX_MEDIA_PER_PROJECT} items` });
        return;
      }

      const accepted: File[] = [];
      for (const file of list.slice(0, room)) {
        if (!PROJECT_IMAGE_MIME_TYPES.includes(file.type as (typeof PROJECT_IMAGE_MIME_TYPES)[number])) {
          toast({
            tone: 'error',
            title: `${file.name} is not a supported image`,
            description: 'Use JPG, PNG, WebP or AVIF.',
          });
          continue;
        }
        // Generous because the browser is about to shrink it; the bucket's own
        // 10 MB limit applies to what actually gets uploaded.
        if (file.size > MAX_PROJECT_IMAGE_BYTES * 4) {
          toast({
            tone: 'error',
            title: `${file.name} is too large`,
            description: 'Please pick an image under 40 MB.',
          });
          continue;
        }
        accepted.push(file);
      }

      if (list.length > room) {
        toast({ tone: 'warning', title: `Only ${room} more item${room === 1 ? '' : 's'} can be added` });
      }
      if (!accepted.length) return;

      setBusy(true);
      const supabase = createClient();

      for (const file of accepted) {
        const localUrl = URL.createObjectURL(file);
        const placeholderId = `pending-${crypto.randomUUID()}`;

        setItems((current) => [
          ...current,
          {
            id: placeholderId,
            type: 'gallery',
            url: '',
            storagePath: null,
            sortOrder: current.length,
            isCover: false,
            pending: true,
            localUrl,
          },
        ]);

        try {
          const { blob, width, height, ext, failure } = await optimiseImage(file);

          // Report and carry on: the builder gets their photo either way, and
          // they are not the person who needs to know the canvas gave up.
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
              },
            });
          }

          const path = `projects/${projectId}/${crypto.randomUUID()}.${ext}`;

          const { error: uploadError } = await supabase.storage
            .from(BUCKET)
            .upload(path, blob, { contentType: blob.type || file.type, upsert: false });

          if (uploadError) throw new Error(uploadError.message);

          const result = await registerProjectImage(projectId, path, {
            width: width || undefined,
            height: height || undefined,
            byteSize: blob.size,
          });

          if (!result.ok) throw new Error(result.error);

          setItems((current) =>
            current.map((item) => (item.id === placeholderId ? result.data : item)),
          );
        } catch (error) {
          setItems((current) => current.filter((item) => item.id !== placeholderId));
          toast({
            tone: 'error',
            title: `Could not upload ${file.name}`,
            description: error instanceof Error ? error.message : undefined,
          });
        } finally {
          URL.revokeObjectURL(localUrl);
        }
      }

      setBusy(false);
    },
    [items.length, projectId, toast],
  );

  async function handleSetCover(mediaId: string) {
    const previous = items;
    setItems((current) =>
      current.map((i) =>
        i.type === 'cover' || i.type === 'gallery'
          ? { ...i, type: i.id === mediaId ? 'cover' : 'gallery', isCover: i.id === mediaId }
          : i,
      ),
    );

    const result = await setProjectCover(projectId, mediaId);
    if (!result.ok) {
      setItems(previous);
      toast({ tone: 'error', title: 'Could not set the cover photo', description: result.error });
    }
  }

  async function handleDelete(mediaId: string) {
    const previous = items;
    setItems((current) => current.filter((i) => i.id !== mediaId));

    const result = await deleteProjectMedia(projectId, mediaId);
    if (!result.ok) {
      setItems(previous);
      toast({ tone: 'error', title: 'Could not remove that photo', description: result.error });
    }
  }

  async function commitOrder(next: Item[]) {
    const previous = items;
    setItems(next);

    const result = await reorderProjectMedia(
      projectId,
      next.filter((i) => !i.pending).map((i) => i.id),
    );
    if (!result.ok) {
      setItems(previous);
      toast({ tone: 'error', title: 'Could not save the new order', description: result.error });
    }
  }

  function handleDrop(targetIndex: number) {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from === null || from === targetIndex) return;

    const next = [...images];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(targetIndex, 0, moved);
    void commitOrder(next);
  }

  if (readOnly) {
    return (
      <p className="text-sm text-ink-600">
        You have read-only access to this project, so its photos and video cannot be changed. Ask an
        owner or admin for the marketing role.
      </p>
    );
  }

  const settled = images.filter((i) => !i.pending).length;

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            // Only a file drop; reordering has its own handlers below.
            if (e.dataTransfer.files?.length) void handleFiles(e.dataTransfer.files);
          }}
          className={cn(
            'rounded-card border-2 border-dashed p-8 text-center transition-colors',
            dragOver ? 'border-brand-500 bg-brand-50/60' : 'border-ink-300 bg-ink-50/50',
          )}
        >
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-white text-ink-500 shadow-sm">
            {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <ImageUp className="size-5" aria-hidden />}
          </span>

          <p className="mt-3 text-sm font-semibold text-ink-900">
            Drag photos here, or pick them from your device
          </p>
          <p className="mt-1 text-xs text-ink-500">
            Elevations, the site, show flats, amenities. JPG, PNG, WebP or AVIF — up to{' '}
            {MAX_MEDIA_PER_PROJECT} items. Shrunk in your browser before upload, so a big camera
            file is fine.
          </p>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            Choose photos
          </Button>

          <input
            ref={inputRef}
            type="file"
            accept={PROJECT_IMAGE_MIME_TYPES.join(',')}
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void handleFiles(e.target.files);
              // Reset so re-picking the same file fires change again.
              e.target.value = '';
            }}
          />
        </div>

        {images.length > 0 ? (
          <>
            <p className="text-xs text-ink-500">
              {settled} photo{settled === 1 ? '' : 's'}. Drag to reorder — the first one is the
              cover unless you star another. The cover is what buyers see on the project card.
            </p>

            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {images.map((item, index) => (
                <li
                  key={item.id}
                  draggable={!item.pending}
                  onDragStart={() => {
                    dragIndex.current = index;
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDrop(index);
                  }}
                  className={cn(
                    'group relative aspect-4/3 overflow-hidden rounded-field border bg-ink-100',
                    item.isCover ? 'border-brand-500 ring-1 ring-brand-500' : 'border-ink-200',
                    item.pending && 'opacity-60',
                  )}
                >
                  {item.pending ? (
                    item.localUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- a blob: URL cannot go through next/image
                      <img src={item.localUrl} alt="" className="size-full object-cover" />
                    ) : null
                  ) : (
                    <Image
                      src={item.url}
                      alt=""
                      fill
                      sizes="(min-width: 1024px) 15vw, (min-width: 640px) 30vw, 45vw"
                      className="object-cover"
                    />
                  )}

                  {item.pending ? (
                    <span className="absolute inset-0 grid place-items-center">
                      <Loader2 className="size-5 animate-spin text-white drop-shadow" aria-hidden />
                    </span>
                  ) : (
                    <>
                      {item.isCover ? (
                        <span className="absolute left-1.5 top-1.5 rounded-full bg-brand-600 px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide text-white">
                          Cover
                        </span>
                      ) : null}

                      <span className="absolute left-1.5 bottom-1.5 cursor-grab text-white/80 opacity-0 transition-opacity group-hover:opacity-100">
                        <GripVertical className="size-4 drop-shadow" aria-hidden />
                      </span>

                      <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                        {!item.isCover ? (
                          <button
                            type="button"
                            onClick={() => void handleSetCover(item.id)}
                            aria-label="Use as cover photo"
                            title="Use as cover photo"
                            className="grid size-7 place-items-center rounded-full bg-white/90 text-ink-700 shadow-sm hover:bg-white hover:text-brand-700"
                          >
                            <Star className="size-3.5" aria-hidden />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => void handleDelete(item.id)}
                          aria-label="Remove this photo"
                          title="Remove this photo"
                          className="grid size-7 place-items-center rounded-full bg-white/90 text-ink-700 shadow-sm hover:bg-white hover:text-rose-700"
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>

      <ProjectVideoField
        projectId={projectId}
        initialValue={initialVideoUrl}
        onSaved={(url) =>
          setItems((current) => {
            const withoutVideo = current.filter((i) => i.type !== 'video');
            return url
              ? [
                  ...withoutVideo,
                  { id: `video-${url}`, type: 'video', url, storagePath: null, sortOrder: 200, isCover: false },
                ]
              : withoutVideo;
          })
        }
      />
    </div>
  );
}

/**
 * The video link.
 *
 * Parses as you type, like the seller's field does, so a wrong link is caught
 * while it can still be fixed rather than after saving. Unlike the seller's,
 * this one saves on its own — the project form around it is a separate
 * server-action form, and folding a video into it would mean a builder could
 * not add a video without re-submitting every other field.
 */
function ProjectVideoField({
  projectId,
  initialValue,
  onSaved,
}: {
  projectId: string;
  initialValue: string;
  onSaved: (url: string) => void;
}) {
  const toast = useToast();
  const [value, setValue] = React.useState(initialValue);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(initialValue);

  const parsed = React.useMemo(() => parseVideoUrl(value), [value]);
  const touched = value.trim().length > 0;
  const dirty = value.trim() !== saved.trim();

  async function save() {
    setSaving(true);
    try {
      const result = await setProjectVideo(projectId, value);
      if (!result.ok) {
        toast({ tone: 'error', title: 'Could not save the video link', description: result.error });
        return;
      }

      const stored = parsed?.canonicalUrl ?? '';
      setValue(stored);
      setSaved(stored);
      onSaved(stored);
      toast({
        tone: 'success',
        title: stored ? 'Video link saved' : 'Video link removed',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-t border-ink-200 pt-6">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
        <Video className="size-4 text-ink-400" aria-hidden />
        Video walkthrough <span className="font-normal text-ink-400">(optional)</span>
      </h3>
      <p className="mt-1 text-sm text-ink-600">
        A walkthrough gets far more enquiries than photos alone. Put it on YouTube or Vimeo —
        unlisted is fine — and paste the link here. Nothing is uploaded to 99Estate; it stays on
        your own channel.
      </p>

      <div className="mt-4 flex max-w-xl flex-wrap items-start gap-2">
        <Field
          label="YouTube or Vimeo link"
          htmlFor="project_video_url"
          className="min-w-0 flex-1"
          error={
            touched && !parsed
              ? 'This does not look like a YouTube or Vimeo link. Those are the only two that can be embedded.'
              : undefined
          }
          hint="Clear the box and save to remove the video."
        >
          <Input
            id="project_video_url"
            name="project_video_url"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="https://youtu.be/…"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
          />
        </Field>

        <Button
          type="button"
          variant="outline"
          className="mt-6 shrink-0"
          disabled={saving || !dirty || (touched && !parsed)}
          onClick={() => void save()}
        >
          {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {value.trim() === '' ? 'Remove' : 'Save link'}
        </Button>
      </div>

      {parsed ? (
        <div className="mt-3 max-w-xl">
          <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
            <CheckCircle2 className="size-3.5" aria-hidden />
            {VIDEO_PROVIDER_LABELS[parsed.provider]} video recognised
          </p>
          {/* Shown before saving on purpose: somebody pasting the wrong link
              from their history should see it is the wrong video while they can
              still fix it, and the only reliable way to know is to watch it. */}
          <div className="mt-2 aspect-video overflow-hidden rounded-field border border-ink-200 bg-ink-950">
            <iframe
              src={parsed.embedUrl}
              title="Project video preview"
              className="size-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
