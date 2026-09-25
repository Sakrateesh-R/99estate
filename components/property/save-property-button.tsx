'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { toggleSavedProperty } from '@/lib/properties/save-actions';
import { rememberReturnTo } from '@/lib/auth/return-to-actions';

/**
 * Save toggle (§14).
 *
 * Optimistic: the heart fills immediately and reverts if the server disagrees.
 * Saving is a low-stakes, high-frequency action — waiting on a round trip
 * makes the whole grid feel sluggish.
 */
export function SavePropertyButton({
  propertyId,
  initialSaved,
  nextPath,
  variant = 'icon',
  className,
}: {
  propertyId: string;
  initialSaved: boolean;
  nextPath: string;
  variant?: 'icon' | 'labelled';
  className?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [saved, setSaved] = React.useState(initialSaved);
  const [busy, setBusy] = React.useState(false);

  async function handleClick() {
    const previous = saved;
    setSaved(!previous);
    setBusy(true);

    try {
      const result = await toggleSavedProperty(propertyId);

      if (result.status === 'sign_in_required') {
        setSaved(previous);
        // Destination goes into an httpOnly cookie, not the URL.
        await rememberReturnTo(nextPath);
        router.push('/login');
        return;
      }
      if (result.status === 'error') {
        setSaved(previous);
        toast({ tone: 'error', title: 'Could not update saved properties', description: result.message });
        return;
      }

      setSaved(result.status === 'saved');
    } finally {
      setBusy(false);
    }
  }

  const label = saved ? 'Saved' : 'Save';

  if (variant === 'labelled') {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        aria-pressed={saved}
        className={cn(
          'inline-flex h-11 items-center justify-center gap-2 rounded-field border px-4 text-[0.9375rem] font-semibold transition-colors',
          saved
            ? 'border-red-200 bg-red-50 text-red-600'
            : 'border-ink-300 bg-white text-ink-700 hover:border-ink-400 hover:bg-ink-50',
          className,
        )}
      >
        <Heart className={cn('size-4', saved && 'fill-current')} aria-hidden />
        {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      aria-pressed={saved}
      aria-label={saved ? 'Remove from saved' : 'Save property'}
      className={cn(
        'grid size-10 place-items-center rounded-full bg-white/95 text-ink-600 shadow-sm transition-colors hover:text-red-600',
        saved && 'text-red-600',
        className,
      )}
    >
      <Heart className={cn('size-[1.125rem]', saved && 'fill-current')} aria-hidden />
    </button>
  );
}
