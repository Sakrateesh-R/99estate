'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog } from '@/components/ui/dialog';
import { renewListings } from '@/lib/admin/actions';

/**
 * §18 — renew one listing, or every listing shown.
 *
 * The bulk button asks first. Renewing is not destructive — it moves an expiry
 * date forward — but doing it to thirty listings at once includes any that have
 * quietly sold, and a listing that is back on the market after being sold is
 * somebody fielding calls about land they no longer own. Worth one confirmation.
 */
export function RenewListings({
  ids,
  label = 'Renew',
  variant = 'single',
}: {
  ids: string[];
  label?: string;
  variant?: 'single' | 'bulk';
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);

  async function run() {
    setBusy(true);
    setConfirming(false);
    try {
      const result = await renewListings(ids);
      if (!result.ok) {
        toast({ tone: 'error', title: 'Could not renew', description: result.error });
        return;
      }

      const { renewed, failed } = result.data;
      toast({
        tone: failed > 0 ? 'warning' : 'success',
        title: `${renewed} listing${renewed === 1 ? '' : 's'} renewed for 90 days`,
        description: failed > 0 ? `${failed} could not be renewed and were left alone.` : undefined,
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={busy || ids.length === 0}
        onClick={() => (variant === 'bulk' ? setConfirming(true) : void run())}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-field font-semibold transition-colors disabled:opacity-50',
          variant === 'bulk'
            ? 'h-11 bg-brand-700 px-5 text-[0.9375rem] text-white hover:bg-brand-800'
            : 'h-9 border border-ink-300 bg-white px-3 text-sm text-ink-700 hover:border-ink-400 hover:bg-ink-50',
        )}
      >
        <RefreshCw className={cn('size-4', busy && 'animate-spin')} aria-hidden />
        {label}
      </button>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Renew ${ids.length} listing${ids.length === 1 ? '' : 's'}?`}
        description="Each gets another 90 days from now. Check that none of them have already sold — a listing back on the market after a sale means somebody fielding calls about land they no longer own."
        confirmLabel="Renew them"
        loading={busy}
        onConfirm={run}
      />
    </>
  );
}
