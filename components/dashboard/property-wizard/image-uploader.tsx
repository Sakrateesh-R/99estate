'use client';

import * as React from 'react';
import Image from 'next/image';
import { GripVertical, ImageUp, Loader2, Star, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { createClient } from '@/lib/supabase/client';
import {
  deletePropertyImage,
  registerPropertyImage,
  reorderPropertyImages,
  setCoverImage,
  type RegisteredImage,
} from '@/lib/properties/image-actions';
import {
  IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
  MAX_IMAGES_PER_PROPERTY,
  MIN_IMAGES_FOR_SUBMISSION,
  photoRequirementLabel,
} from '@/lib/properties/schema';

const BUCKET = 'property-images';
const MAX_EDGE = 1920;
const WEBP_QUALITY = 0.82;

type UploadItem = RegisteredImage & { pending?: boolean; localUrl?: string };

/**
 * Downscales and re-encodes a photo to WebP before upload (§13).
 *
 * Phone cameras produce 4–12 MB JPEGs; nothing on this site displays an image
 * wider than ~1900px. Doing this in the browser saves the seller's data, keeps
 * uploads inside the 10 MB bucket limit, and means the CDN serves a sane file.
 * If anything goes wrong we fall back to the original file rather than
 * blocking the upload.
 */
async function optimiseImage(file: File): Promise<{ blob: Blob; width: number; height: number; ext: string }> {
  const fallback = { blob: file, width: 0, height: 0, ext: file.name.split('.').pop() ?? 'jpg' };

  if (typeof createImageBitmap !== 'function') return fallback;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return fallback;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', WEBP_QUALITY),
    );

    if (!blob) return fallback;
    return { blob, width, height, ext: 'webp' };
  } catch {
    return fallback;
  }
}

export function ImageUploader({
  propertyId,
  initialImages,
  onCountChange,
}: {
  propertyId: string;
  initialImages: RegisteredImage[];
  onCountChange?: (count: number) => void;
}) {
  const [images, setImages] = React.useState<UploadItem[]>(initialImages);
  const [busy, setBusy] = React.useState(false);
  const [dragOver, setDragOver] = React.useState(false);
  const dragIndex = React.useRef<number | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const toast = useToast();

  React.useEffect(() => {
    onCountChange?.(images.filter((i) => !i.pending).length);
  }, [images, onCountChange]);

  const handleFiles = React.useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      const room = MAX_IMAGES_PER_PROPERTY - images.length;

      if (room <= 0) {
        toast({ tone: 'warning', title: `You already have ${MAX_IMAGES_PER_PROPERTY} photos` });
        return;
      }

      const accepted: File[] = [];
      for (const file of list.slice(0, room)) {
        if (!IMAGE_MIME_TYPES.includes(file.type as (typeof IMAGE_MIME_TYPES)[number])) {
          toast({ tone: 'error', title: `${file.name} is not a supported image`, description: 'Use JPG, PNG, WebP or AVIF.' });
          continue;
        }
        if (file.size > MAX_IMAGE_BYTES * 4) {
          toast({ tone: 'error', title: `${file.name} is too large`, description: 'Please pick an image under 40 MB.' });
          continue;
        }
        accepted.push(file);
      }

      if (list.length > room) {
        toast({ tone: 'warning', title: `Only ${room} more photo${room === 1 ? '' : 's'} can be added` });
      }
      if (!accepted.length) return;

      setBusy(true);
      const supabase = createClient();

      for (const file of accepted) {
        const localUrl = URL.createObjectURL(file);
        const placeholderId = `pending-${crypto.randomUUID()}`;

        setImages((current) => [
          ...current,
          { id: placeholderId, storagePath: '', publicUrl: '', isCover: false, sortOrder: current.length, pending: true, localUrl },
        ]);

        try {
          const { blob, width, height, ext } = await optimiseImage(file);
          const path = `properties/${propertyId}/${crypto.randomUUID()}.${ext}`;

          const { error: uploadError } = await supabase.storage
            .from(BUCKET)
            .upload(path, blob, { contentType: blob.type || file.type, upsert: false });

          if (uploadError) throw new Error(uploadError.message);

          const result = await registerPropertyImage(propertyId, path, {
            width: width || undefined,
            height: height || undefined,
            byteSize: blob.size,
          });

          if (!result.ok) throw new Error(result.error);

          setImages((current) =>
            current.map((item) => (item.id === placeholderId ? result.data : item)),
          );
        } catch (error) {
          setImages((current) => current.filter((item) => item.id !== placeholderId));
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
    [images.length, propertyId, toast],
  );

  async function handleSetCover(imageId: string) {
    const previous = images;
    setImages((current) => current.map((i) => ({ ...i, isCover: i.id === imageId })));

    const result = await setCoverImage(propertyId, imageId);
    if (!result.ok) {
      setImages(previous);
      toast({ tone: 'error', title: 'Could not set the cover photo', description: result.error });
    }
  }

  async function handleDelete(imageId: string) {
    const previous = images;
    setImages((current) => current.filter((i) => i.id !== imageId));

    const result = await deletePropertyImage(propertyId, imageId);
    if (!result.ok) {
      setImages(previous);
      toast({ tone: 'error', title: 'Could not remove that photo', description: result.error });
    }
  }

  async function commitOrder(next: UploadItem[]) {
    const previous = images;
    setImages(next);

    const result = await reorderPropertyImages(
      propertyId,
      next.filter((i) => !i.pending).map((i) => i.id),
    );
    if (!result.ok) {
      setImages(previous);
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

  const settledCount = images.filter((i) => !i.pending).length;

  return (
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
          // Only treat this as a file drop; reordering uses its own handlers.
          if (e.dataTransfer.files?.length) void handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          'rounded-card border-2 border-dashed p-8 text-center transition-colors',
          dragOver ? 'border-brand-500 bg-brand-50/60' : 'border-ink-300 bg-ink-50/50',
        )}
      >
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-white text-ink-500 shadow-sm">
          {busy ? <Loader2 className="size-5 animate-spin" /> : <ImageUp className="size-5" />}
        </span>

        <p className="mt-4 text-sm font-semibold text-ink-900">
          Drag photos here, or{' '}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-brand-700 underline underline-offset-2 hover:text-brand-900"
          >
            browse your device
          </button>
        </p>
        <p className="mt-1.5 text-xs text-ink-500">
          JPG, PNG, WebP or AVIF · up to {MAX_IMAGES_PER_PROPERTY} photos · resized and converted to
          WebP automatically
        </p>

        <input
          ref={inputRef}
          type="file"
          accept={IMAGE_MIME_TYPES.join(',')}
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files?.length) void handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {settledCount > 0 && settledCount < MIN_IMAGES_FOR_SUBMISSION ? (
        <p className="text-sm font-medium text-amber-700">
          Add at least {photoRequirementLabel()} before submitting — you have {settledCount}.
        </p>
      ) : null}

      {images.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((image, index) => (
            <li
              key={image.id}
              draggable={!image.pending}
              onDragStart={() => {
                dragIndex.current = index;
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(index)}
              className={cn(
                'group relative overflow-hidden rounded-card border border-ink-200 bg-ink-100',
                image.pending ? 'opacity-60' : 'cursor-grab active:cursor-grabbing',
              )}
            >
              <div className="relative aspect-[4/3]">
                {image.pending ? (
                  // Local object URL: next/image cannot optimise a blob: source.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={image.localUrl} alt="" className="size-full object-cover" />
                ) : (
                  <Image
                    src={image.publicUrl}
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 15rem, 45vw"
                    className="object-cover"
                  />
                )}

                {image.pending ? (
                  <span className="absolute inset-0 grid place-items-center bg-ink-950/30">
                    <Loader2 className="size-6 animate-spin text-white" />
                  </span>
                ) : null}
              </div>

              {image.isCover ? (
                <span className="absolute left-2 top-2 rounded-full bg-accent-500 px-2 py-0.5 text-[0.6875rem] font-bold uppercase tracking-wide text-ink-950">
                  Cover
                </span>
              ) : null}

              {!image.pending ? (
                <>
                  <span className="absolute right-2 top-2 rounded bg-ink-950/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100">
                    <GripVertical className="size-3.5" aria-hidden />
                  </span>

                  <div className="flex items-center justify-between gap-1 border-t border-ink-200 bg-white px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => void handleSetCover(image.id)}
                      disabled={image.isCover}
                      className={cn(
                        'inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs font-medium transition-colors',
                        image.isCover
                          ? 'cursor-default text-accent-700'
                          : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
                      )}
                    >
                      <Star className={cn('size-3.5', image.isCover && 'fill-accent-400')} aria-hidden />
                      {image.isCover ? 'Cover' : 'Make cover'}
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleDelete(image.id)}
                      className="rounded p-1 text-ink-400 transition-colors hover:bg-red-50 hover:text-red-600"
                      aria-label="Remove photo"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
