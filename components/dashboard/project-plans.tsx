'use client';

import * as React from 'react';
import Image from 'next/image';
import { FileImage, Loader2, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import {
  deleteProjectMedia,
  setProjectMediaTitle,
  setProjectPlanType,
  type ProjectMediaItem,
} from '@/lib/projects/media-actions';
import { rejectReason, uploadProjectImage } from '@/lib/projects/upload-media';
import {
  MAX_MEDIA_PER_PROJECT,
  PROJECT_IMAGE_MIME_TYPES,
  PROJECT_PLAN_TYPE_LABELS,
  PROJECT_PLAN_TYPES,
  type ProjectPlanType,
} from '@/lib/projects/schema';

type Plan = ProjectMediaItem & { pending?: boolean; localUrl?: string };

/**
 * §9 — floor plans and the master plan.
 *
 * The public project page has rendered a "Plans" section from `project_media`
 * since the table shipped — master plan first, then floor plans, each with its
 * title as a caption. Nothing could put one there. This is the other half.
 *
 * Separate from the gallery rather than one uploader with a dropdown, because
 * they are answering different questions. A buyer scrolling photos wants to
 * know what the place looks like; somebody opening the plans is comparing
 * layouts and wants the caption ("2 BHK Type A") more than the image order.
 * So plans get titles and no cover or drag-sort, and photos get the reverse.
 *
 * The upload itself is `uploadProjectImage`, shared with the gallery.
 */
export function ProjectPlans({
  projectId,
  initialPlans,
  readOnly = false,
  totalMediaCount,
}: {
  projectId: string;
  initialPlans: ProjectMediaItem[];
  readOnly?: boolean;
  /** Every media row, because the 40-item cap counts photos and plans together. */
  totalMediaCount: number;
}) {
  const toast = useToast();
  const [plans, setPlans] = React.useState<Plan[]>(initialPlans);
  const [busy, setBusy] = React.useState(false);
  const [dragOver, setDragOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Photos added this session are not in `totalMediaCount`, so count the plans
  // we know about on top of whatever the page was rendered with.
  const used = totalMediaCount - initialPlans.length + plans.length;

  const handleFiles = React.useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      const room = MAX_MEDIA_PER_PROJECT - used;

      if (room <= 0) {
        toast({ tone: 'warning', title: `This project already has ${MAX_MEDIA_PER_PROJECT} items` });
        return;
      }

      const accepted: File[] = [];
      for (const file of list.slice(0, room)) {
        const reason = rejectReason(file);
        if (reason) {
          toast({ tone: 'error', title: `${file.name} was not added`, description: reason });
          continue;
        }
        accepted.push(file);
      }

      if (list.length > room) {
        toast({ tone: 'warning', title: `Only ${room} more item${room === 1 ? '' : 's'} can be added` });
      }
      if (!accepted.length) return;

      setBusy(true);

      for (const file of accepted) {
        const localUrl = URL.createObjectURL(file);
        const placeholderId = `pending-${crypto.randomUUID()}`;

        setPlans((current) => [
          ...current,
          {
            id: placeholderId,
            type: 'floor_plan',
            url: '',
            storagePath: null,
            sortOrder: current.length,
            isCover: false,
            title: null,
            pending: true,
            localUrl,
          },
        ]);

        /**
         * The file name becomes the first draft of the caption.
         *
         * "ground-floor-2bhk.jpg" is a better starting label than nothing, and
         * it is editable right there. The extension and separators go, because
         * nobody wants "Ground Floor 2bhk Jpg" on a public page.
         */
        const suggested = file.name
          .replace(/\.[^.]+$/, '')
          .replace(/[-_]+/g, ' ')
          .trim()
          .slice(0, 150);

        const result = await uploadProjectImage({
          projectId,
          file,
          type: 'floor_plan',
          title: suggested || undefined,
        });

        if (result.ok) {
          setPlans((current) => current.map((p) => (p.id === placeholderId ? result.item : p)));
        } else {
          setPlans((current) => current.filter((p) => p.id !== placeholderId));
          toast({ tone: 'error', title: `Could not upload ${file.name}`, description: result.error });
        }

        URL.revokeObjectURL(localUrl);
      }

      setBusy(false);
    },
    [projectId, toast, used],
  );

  async function handleTypeChange(mediaId: string, next: ProjectPlanType) {
    const previous = plans;
    setPlans((current) => current.map((p) => (p.id === mediaId ? { ...p, type: next } : p)));

    const result = await setProjectPlanType(projectId, mediaId, next);
    if (!result.ok) {
      setPlans(previous);
      toast({ tone: 'error', title: 'Could not change that plan', description: result.error });
    }
  }

  async function handleDelete(mediaId: string) {
    const previous = plans;
    setPlans((current) => current.filter((p) => p.id !== mediaId));

    const result = await deleteProjectMedia(projectId, mediaId);
    if (!result.ok) {
      setPlans(previous);
      toast({ tone: 'error', title: 'Could not remove that plan', description: result.error });
    }
  }

  if (readOnly) {
    return (
      <p className="text-sm text-ink-600">
        You have read-only access to this project, so its plans cannot be changed.
      </p>
    );
  }

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
          if (e.dataTransfer.files?.length) void handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          'rounded-card border-2 border-dashed p-8 text-center transition-colors',
          dragOver ? 'border-brand-500 bg-brand-50/60' : 'border-ink-300 bg-ink-50/50',
        )}
      >
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-white text-ink-500 shadow-sm">
          {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <FileImage className="size-5" aria-hidden />}
        </span>

        <p className="mt-3 text-sm font-semibold text-ink-900">Add floor plans and the master plan</p>
        <p className="mt-1 text-xs text-ink-500">
          Unit layouts, the site layout, phasing. Buyers compare these more than any other image.
          Name each one — &ldquo;2 BHK Type A&rdquo;, &ldquo;Ground Floor&rdquo; — and mark the site
          layout as the master plan.
        </p>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          Choose plans
        </Button>

        <input
          ref={inputRef}
          type="file"
          accept={PROJECT_IMAGE_MIME_TYPES.join(',')}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {plans.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {plans.map((plan) => (
            <li
              key={plan.id}
              className={cn(
                'rounded-card border border-ink-200 bg-white p-3',
                plan.pending && 'opacity-60',
              )}
            >
              {/* `object-contain` and a white ground, unlike the gallery's
                  `object-cover`: a cropped floor plan is a useless floor plan. */}
              <div className="relative aspect-4/3 overflow-hidden rounded-field border border-ink-100 bg-white">
                {plan.pending ? (
                  <>
                    {plan.localUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- a blob: URL cannot go through next/image
                      <img src={plan.localUrl} alt="" className="size-full object-contain" />
                    ) : null}
                    <span className="absolute inset-0 grid place-items-center">
                      <Loader2 className="size-5 animate-spin text-ink-500" aria-hidden />
                    </span>
                  </>
                ) : (
                  <Image
                    src={plan.url}
                    alt={plan.title ?? 'Plan'}
                    fill
                    sizes="(min-width: 640px) 340px, 90vw"
                    className="object-contain"
                  />
                )}
              </div>

              {!plan.pending ? (
                <div className="mt-3 space-y-2">
                  <PlanTitle
                    projectId={projectId}
                    plan={plan}
                    onSaved={(title) =>
                      setPlans((current) =>
                        current.map((p) => (p.id === plan.id ? { ...p, title } : p)),
                      )
                    }
                  />

                  <div className="flex items-center justify-between gap-2">
                    <div className="flex gap-1" role="group" aria-label="Plan kind">
                      {PROJECT_PLAN_TYPES.map((kind) => (
                        <button
                          key={kind}
                          type="button"
                          aria-pressed={plan.type === kind}
                          onClick={() => void handleTypeChange(plan.id, kind)}
                          className={cn(
                            'rounded-full px-2.5 py-1 text-xs font-semibold transition-colors',
                            plan.type === kind
                              ? 'bg-brand-600 text-white'
                              : 'bg-ink-100 text-ink-600 hover:bg-ink-200',
                          )}
                        >
                          {PROJECT_PLAN_TYPE_LABELS[kind]}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleDelete(plan.id)}
                      aria-label={`Remove ${plan.title ?? 'this plan'}`}
                      className="grid size-7 place-items-center rounded-full text-ink-500 transition-colors hover:bg-ink-100 hover:text-rose-700"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * The caption, saved on blur rather than behind its own button.
 *
 * There can be a dozen of these on screen; a Save beside each one would be a
 * dozen buttons doing the same small thing. Blur is when somebody has finished
 * typing, and the value is only sent when it actually changed.
 */
function PlanTitle({
  projectId,
  plan,
  onSaved,
}: {
  projectId: string;
  plan: ProjectMediaItem;
  onSaved: (title: string | null) => void;
}) {
  const toast = useToast();
  const [value, setValue] = React.useState(plan.title ?? '');
  const [saving, setSaving] = React.useState(false);
  const savedRef = React.useRef(plan.title ?? '');

  async function commit() {
    const next = value.trim();
    if (next === savedRef.current) return;

    setSaving(true);
    try {
      const result = await setProjectMediaTitle(projectId, plan.id, next);
      if (!result.ok) {
        setValue(savedRef.current);
        toast({ tone: 'error', title: 'Could not save that name', description: result.error });
        return;
      }
      savedRef.current = next;
      onSaved(next === '' ? null : next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <label className="block">
      <span className="sr-only">Plan name</span>
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        placeholder="e.g. 2 BHK Type A"
        maxLength={150}
        disabled={saving}
        className="text-sm"
      />
    </label>
  );
}
