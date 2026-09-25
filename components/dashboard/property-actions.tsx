'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  Ellipsis,
  ExternalLink,
  KeyRound,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { cn, propertyPath } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog } from '@/components/ui/dialog';
import {
  deleteProperty,
  renewProperty,
  updatePropertyStatus,
} from '@/lib/properties/actions';
import type { SellerPropertyRow } from '@/lib/properties/seller-queries';

type MenuAction = {
  key: string;
  label: string;
  icon: typeof Pencil;
  run: () => Promise<void>;
  destructive?: boolean;
};

/**
 * Row actions for the seller's property table (§11).
 *
 * The menu only offers transitions the database will actually allow — the
 * lifecycle guard rejects anything else, and showing a button that always
 * errors is worse than not showing it.
 */
export function PropertyActions({ property }: { property: SellerPropertyRow }) {
  const router = useRouter();
  const toast = useToast();

  const [open, setOpen] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  async function run(label: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setOpen(false);
    try {
      const result = await fn();
      if (!result.ok) {
        toast({ tone: 'error', title: `Could not ${label.toLowerCase()}`, description: result.error });
        return;
      }
      toast({ tone: 'success', title: `${label} done` });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const actions: MenuAction[] = [];
  const closed = property.status === 'sold' || property.status === 'rented';

  if (property.status === 'published') {
    actions.push({
      key: 'pause',
      label: 'Pause listing',
      icon: Pause,
      run: () => run('Pause', () => updatePropertyStatus(property.id, 'paused')),
    });
  }

  if (property.status === 'paused') {
    actions.push({
      key: 'resume',
      label: 'Resume listing',
      icon: Play,
      run: () => run('Resume', () => updatePropertyStatus(property.id, 'published')),
    });
  }

  if ((property.status === 'published' || property.status === 'paused') && !closed) {
    actions.push({
      key: 'close',
      label: property.listing_type === 'sale' ? 'Mark as sold' : 'Mark as rented',
      icon: CheckCircle2,
      run: () =>
        run('Update', () =>
          updatePropertyStatus(property.id, property.listing_type === 'sale' ? 'sold' : 'rented'),
        ),
    });
  }

  if (property.status === 'expired' || closed || property.status === 'paused') {
    actions.push({
      key: 'renew',
      label: 'Renew for 90 days',
      icon: RefreshCw,
      run: () => run('Renew', () => renewProperty(property.id)),
    });
  }

  if (property.status === 'published' && property.verification_status === 'unverified') {
    actions.push({
      key: 'verify',
      label: 'Request verification',
      icon: KeyRound,
      run: async () => {
        setOpen(false);
        toast({
          tone: 'info',
          title: 'Verification opens soon',
          description: 'We are still building document review. Your listing stays live meanwhile.',
        });
      },
    });
  }

  actions.push({
    key: 'delete',
    label: 'Delete listing',
    icon: Trash2,
    destructive: true,
    run: async () => {
      setOpen(false);
      setConfirmDelete(true);
    },
  });

  return (
    <div ref={containerRef} className="relative flex items-center justify-end gap-1">
      <Link
        href={`/dashboard/properties/${property.id}/edit`}
        className="grid size-9 place-items-center rounded-lg text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
        aria-label={`Edit ${property.title}`}
      >
        <Pencil className="size-4" />
      </Link>

      {property.status === 'published' ? (
        <Link
          href={propertyPath(property)}
          className="grid size-9 place-items-center rounded-lg text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
          aria-label={`View ${property.title} as a buyer`}
        >
          <ExternalLink className="size-4" />
        </Link>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`More actions for ${property.title}`}
        className="grid size-9 place-items-center rounded-lg text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 disabled:opacity-50"
      >
        <Ellipsis className="size-4" />
      </button>

      {open ? (
        <div
          role="menu"
          className="animate-fade-up absolute right-0 top-10 z-40 w-56 overflow-hidden rounded-card border border-ink-200 bg-white py-1 shadow-pop"
        >
          {actions.map(({ key, label, icon: Icon, run: onRun, destructive }) => (
            <button
              key={key}
              type="button"
              role="menuitem"
              onClick={() => void onRun()}
              className={cn(
                'flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm transition-colors',
                destructive
                  ? 'text-red-600 hover:bg-red-50'
                  : 'text-ink-700 hover:bg-ink-50 hover:text-ink-950',
              )}
            >
              <Icon className={cn('size-4', destructive ? 'text-red-500' : 'text-ink-400')} aria-hidden />
              {label}
            </button>
          ))}
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          void run('Delete', () => deleteProperty(property.id));
        }}
        title="Delete this listing?"
        description={`“${property.title}” and its photos will be removed permanently. Leads you have already received are kept.`}
        confirmLabel="Delete permanently"
        destructive
        loading={busy}
      />
    </div>
  );
}
