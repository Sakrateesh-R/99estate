'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { sweepExpiredListings } from '@/lib/admin/actions';

/**
 * §18 — run the listing sweep now.
 *
 * Reports what it did rather than just succeeding. "Nothing to do" and "expired
 * 14 listings" are both fine outcomes, and an admin checking whether the
 * scheduler is alive needs to be able to tell them apart.
 */
export function SweepButton() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);

  async function run() {
    setBusy(true);
    const result = await sweepExpiredListings();
    setBusy(false);

    if (!result.ok) {
      toast({ tone: 'error', title: 'The sweep failed', description: result.error });
      return;
    }

    const { expired, warned } = result.data;
    toast({
      tone: 'success',
      title: expired === 0 && warned === 0 ? 'Nothing was due' : 'Sweep finished',
      description:
        expired === 0 && warned === 0
          ? 'No listing has passed its expiry date, and nobody needed warning.'
          : [
              expired > 0 ? `Expired ${expired} listing${expired === 1 ? '' : 's'}` : null,
              warned > 0 ? `warned ${warned} seller${warned === 1 ? '' : 's'}` : null,
            ]
              .filter(Boolean)
              .join(', ') + '.',
    });
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-field border border-ink-200 bg-white px-3 py-2 text-xs font-semibold text-ink-700 transition-colors hover:bg-ink-50 disabled:opacity-60"
    >
      <RefreshCw className={cn('size-3.5', busy && 'animate-spin')} aria-hidden />
      {busy ? 'Running…' : 'Run the sweep now'}
    </button>
  );
}
