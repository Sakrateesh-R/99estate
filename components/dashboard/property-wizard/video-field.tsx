'use client';

import * as React from 'react';
import { CheckCircle2, Video } from 'lucide-react';
import { Field, Input } from '@/components/ui/field';
import { parseVideoUrl, VIDEO_PROVIDER_LABELS } from '@/lib/properties/video';

/**
 * §12 — the video tour link.
 *
 * Parses as you type so the seller finds out the link is wrong here, rather
 * than three steps later when the draft is saved. The same parser runs in the
 * schema and the same two shapes are enforced by a CHECK constraint, so this is
 * purely about telling somebody early.
 */
export function VideoField({
  value,
  error,
  onChange,
}: {
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const parsed = React.useMemo(() => parseVideoUrl(value), [value]);
  const touched = value.trim().length > 0;

  return (
    <div className="mt-8 border-t border-ink-200 pt-6">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
        <Video className="size-4 text-ink-400" aria-hidden />
        Video tour <span className="font-normal text-ink-400">(optional)</span>
      </h3>
      <p className="mt-1 text-sm text-ink-600">
        A walkthrough gets far more enquiries than photos alone. Upload it to YouTube or Vimeo —
        unlisted is fine — and paste the link here.
      </p>

      <Field
        label="YouTube or Vimeo link"
        htmlFor="video_url"
        className="mt-4 max-w-xl"
        error={error ?? (touched && !parsed ? 'That is not a YouTube or Vimeo link.' : undefined)}
        hint="Nothing is uploaded to 99Estate — the video stays on your own channel."
      >
        <Input
          id="video_url"
          name="video_url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://youtu.be/…"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
        />
      </Field>

      {parsed ? (
        <div className="mt-3 max-w-xl">
          <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
            <CheckCircle2 className="size-3.5" aria-hidden />
            {VIDEO_PROVIDER_LABELS[parsed.provider]} video recognised
          </p>
          {/*
            Shown before saving on purpose: a seller pasting the wrong link from
            their history should see it is the wrong video while they can still
            fix it, and the only reliable way to know is to watch it.
          */}
          <div className="mt-2 aspect-video overflow-hidden rounded-field border border-ink-200 bg-ink-950">
            <iframe
              src={parsed.embedUrl}
              title="Video tour preview"
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
