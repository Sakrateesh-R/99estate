'use client';

import * as React from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, Expand, ImageIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PropertyImage } from '@/lib/properties/detail';

/**
 * §10 image gallery.
 *
 * The first image is `priority` — on a property page the hero photo is the
 * LCP element, and letting it lazy-load costs a visible beat.
 */
export function PropertyGallery({ images, title }: { images: PropertyImage[]; title: string }) {
  const [index, setIndex] = React.useState(0);
  const [lightbox, setLightbox] = React.useState(false);

  const count = images.length;
  const go = React.useCallback(
    (delta: number) => setIndex((i) => (count === 0 ? 0 : (i + delta + count) % count)),
    [count],
  );

  React.useEffect(() => {
    if (!lightbox) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setLightbox(false);
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [lightbox, go]);

  if (count === 0) {
    return (
      <div className="grid aspect-[16/10] place-items-center rounded-card border border-ink-200 bg-ink-100 text-ink-300">
        <ImageIcon className="size-12" aria-hidden />
        <p className="mt-2 text-sm text-ink-400">No photos yet</p>
      </div>
    );
  }

  const current = images[index]!;

  return (
    <>
      <div className="overflow-hidden rounded-card border border-ink-200 bg-white">
        <div className="group relative aspect-[16/10] bg-ink-100">
          <Image
            src={current.publicUrl}
            alt={`${title} — photo ${index + 1} of ${count}`}
            fill
            sizes="(min-width: 1024px) 48rem, 100vw"
            priority={index === 0}
            className="object-cover"
          />

          <button
            type="button"
            onClick={() => setLightbox(true)}
            className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-ink-950/65 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition-colors hover:bg-ink-950/85"
          >
            <Expand className="size-3.5" aria-hidden />
            View all {count}
          </button>

          {count > 1 ? (
            <>
              <GalleryArrow side="left" onClick={() => go(-1)} />
              <GalleryArrow side="right" onClick={() => go(1)} />
              <span className="absolute bottom-3 right-3 rounded-full bg-ink-950/65 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
                {index + 1} / {count}
              </span>
            </>
          ) : null}
        </div>

        {count > 1 ? (
          <div className="scrollbar-none flex gap-2 overflow-x-auto p-3">
            {images.map((image, i) => (
              <button
                key={image.id}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show photo ${i + 1}`}
                aria-current={i === index}
                className={cn(
                  'relative size-16 shrink-0 overflow-hidden rounded-lg ring-2 transition-all sm:size-20',
                  i === index ? 'ring-brand-600' : 'ring-transparent hover:ring-ink-300',
                )}
              >
                <Image src={image.publicUrl} alt="" fill sizes="80px" className="object-cover" />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {lightbox ? (
        <div
          className="fixed inset-0 z-[80] flex flex-col bg-ink-950/96"
          role="dialog"
          aria-modal="true"
          aria-label={`${title} photo gallery`}
        >
          <div className="flex items-center justify-between px-4 py-3 text-white">
            <span className="text-sm font-medium">
              {index + 1} of {count}
            </span>
            <button
              type="button"
              onClick={() => setLightbox(false)}
              className="-m-2 rounded p-2 transition-colors hover:bg-white/10"
              aria-label="Close gallery"
              autoFocus
            >
              <X className="size-6" />
            </button>
          </div>

          <div className="relative flex-1">
            <Image
              src={current.publicUrl}
              alt={`${title} — photo ${index + 1}`}
              fill
              sizes="100vw"
              className="object-contain"
            />
            {count > 1 ? (
              <>
                <GalleryArrow side="left" onClick={() => go(-1)} inverted />
                <GalleryArrow side="right" onClick={() => go(1)} inverted />
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

function GalleryArrow({
  side,
  onClick,
  inverted = false,
}: {
  side: 'left' | 'right';
  onClick: () => void;
  inverted?: boolean;
}) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === 'left' ? 'Previous photo' : 'Next photo'}
      className={cn(
        'absolute top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full transition-all',
        side === 'left' ? 'left-3' : 'right-3',
        inverted
          ? 'bg-white/15 text-white hover:bg-white/25'
          : 'bg-white/90 text-ink-800 opacity-0 shadow-sm hover:bg-white group-hover:opacity-100 focus-visible:opacity-100',
      )}
    >
      <Icon className="size-5" />
    </button>
  );
}
