'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import type { ActionResult } from '@/lib/properties/actions';

/**
 * §16 — the approve / reject pair used by every queue.
 *
 * Nothing here is optimistic, unlike the lead pipeline. These decisions are
 * visible to a seller and change what the public can see, so the button waits
 * for the server rather than showing an outcome that might not have happened.
 *
 * Rejection always collects a reason before it fires. A seller told only
 * "rejected" has nothing to act on, and the RPC requires one anyway — asking
 * first turns a server error into a form field.
 */
export function DecisionButtons({
  onApprove,
  onReject,
  approveLabel = 'Approve',
  rejectLabel = 'Reject',
  reasonLabel = 'Reason for rejection',
  reasonPlaceholder = 'Explain what the seller needs to change…',
  requireReason = true,
  approveToast = 'Approved',
  rejectToast = 'Rejected',
}: {
  onApprove: () => Promise<ActionResult>;
  onReject: (reason: string) => Promise<ActionResult>;
  approveLabel?: string;
  rejectLabel?: string;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  requireReason?: boolean;
  /**
   * The confirmation the admin sees. Not every queue is an approval — on the
   * reports queue the two buttons dismiss and close a report — and a toast
   * saying "Rejected" after "Mark resolved" describes a decision nobody made.
   */
  approveToast?: string;
  rejectToast?: string;
}) {
  const router = useRouter();
  const toast = useToast();

  const [busy, setBusy] = React.useState<null | 'approve' | 'reject'>(null);
  const [rejecting, setRejecting] = React.useState(false);
  const [reason, setReason] = React.useState('');

  async function run(kind: 'approve' | 'reject', fn: () => Promise<ActionResult>) {
    setBusy(kind);
    const result = await fn();
    setBusy(null);

    if (!result.ok) {
      toast({ tone: 'error', title: 'Could not save', description: result.error });
      return;
    }

    setRejecting(false);
    setReason('');
    toast({ tone: 'success', title: kind === 'approve' ? approveToast : rejectToast });
    router.refresh();
  }

  if (rejecting) {
    return (
      <div className="w-full">
        <label className="text-xs font-medium text-ink-600">{reasonLabel}</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={1000}
          autoFocus
          placeholder={reasonPlaceholder}
          className="mt-1 w-full rounded-field border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy !== null || (requireReason && reason.trim().length < 10)}
            onClick={() => run('reject', () => onReject(reason))}
            className="rounded-field bg-red-600 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:bg-ink-200 disabled:text-ink-400"
          >
            {busy === 'reject' ? 'Rejecting…' : `Confirm ${rejectLabel.toLowerCase()}`}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => {
              setRejecting(false);
              setReason('');
            }}
            className="rounded-field border border-ink-200 px-3.5 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50"
          >
            Cancel
          </button>
          {requireReason && reason.trim().length < 10 ? (
            <p className="self-center text-xs text-ink-400">
              At least a sentence — the seller sees this.
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => run('approve', onApprove)}
        className={cn(
          'rounded-field bg-brand-700 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-800',
          busy !== null && 'opacity-60',
        )}
      >
        {busy === 'approve' ? 'Saving…' : approveLabel}
      </button>
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => setRejecting(true)}
        className="rounded-field border border-ink-200 px-3.5 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50"
      >
        {rejectLabel}
      </button>
    </div>
  );
}

/**
 * Suspend / reactivate.
 *
 * Suspension is destructive from the user's side — they lose access to their
 * own listings — so it asks once before firing. Reactivation is not, and
 * confirming a harmless action just trains people to click through dialogs.
 */
export function AccountStatusButton({
  userId,
  status,
  disabled,
  disabledReason,
  onChange,
}: {
  userId: string;
  status: 'active' | 'suspended';
  disabled?: boolean;
  disabledReason?: string;
  onChange: (userId: string, status: 'active' | 'suspended') => Promise<ActionResult>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);

  const suspending = status === 'active';

  async function apply() {
    setBusy(true);
    const result = await onChange(userId, suspending ? 'suspended' : 'active');
    setBusy(false);
    setConfirming(false);

    if (!result.ok) {
      toast({ tone: 'error', title: 'Could not update', description: result.error });
      return;
    }
    toast({ tone: 'success', title: suspending ? 'Account suspended' : 'Account reactivated' });
    router.refresh();
  }

  if (disabled) {
    return <span className="text-xs text-ink-400">{disabledReason ?? '—'}</span>;
  }

  if (confirming) {
    return (
      <span className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={apply}
          disabled={busy}
          className="rounded-field bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
        >
          {busy ? 'Suspending…' : 'Confirm'}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={busy}
          className="rounded-field border border-ink-200 px-2.5 py-1.5 text-xs font-medium text-ink-600 hover:bg-ink-50"
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => (suspending ? setConfirming(true) : apply())}
      disabled={busy}
      className={cn(
        'rounded-field border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-60',
        suspending
          ? 'border-red-200 text-red-700 hover:bg-red-50'
          : 'border-ink-200 text-ink-700 hover:bg-ink-50',
      )}
    >
      {busy ? 'Saving…' : suspending ? 'Suspend' : 'Reactivate'}
    </button>
  );
}
