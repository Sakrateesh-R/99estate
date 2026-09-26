'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, CheckCheck, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDateTime, formatRelative } from '@/lib/format';
import { useToast } from '@/components/ui/toast';
import { NotificationIcon } from '@/components/notifications/notification-icon';
import {
  deleteNotification,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/notifications/actions';
import type { NotificationRow } from '@/lib/notifications/queries';

/**
 * §19 — the inbox itself.
 *
 * Read and dismiss are both optimistic, for the same reason as the bell: the
 * server is going to agree, and the row should not sit there looking broken
 * while it says so. Anything the server rejects is put back, with the reason.
 *
 * The overrides are keyed to the props that produced them, so a navigation or
 * a `router.refresh()` discards them rather than letting a stale "removed" set
 * hide a notification that arrived later.
 */
export function NotificationList({ items }: { items: NotificationRow[] }) {
  const router = useRouter();
  const toast = useToast();

  const signature = items.map((n) => `${n.id}:${n.is_read}`).join(',');
  const [override, setOverride] = React.useState({
    signature,
    read: new Set<string>(),
    removed: new Set<string>(),
    all: false,
  });
  const state =
    override.signature === signature
      ? override
      : { signature, read: new Set<string>(), removed: new Set<string>(), all: false };

  const [busy, setBusy] = React.useState<string | null>(null);

  const visible = items.filter((n) => !state.removed.has(n.id));
  const isRead = (n: NotificationRow) => n.is_read || state.all || state.read.has(n.id);
  const unreadCount = visible.filter((n) => !isRead(n)).length;

  async function onMarkRead(id: string) {
    setOverride({ ...state, signature, read: new Set(state.read).add(id) });

    const result = await markNotificationRead(id);
    if (!result.ok) {
      const read = new Set(state.read);
      read.delete(id);
      setOverride({ ...state, signature, read });
      toast({ tone: 'error', title: 'Could not mark as read', description: result.error });
      return;
    }
    router.refresh();
  }

  async function onMarkAll() {
    setOverride({ ...state, signature, all: true });

    const result = await markAllNotificationsRead();
    if (!result.ok) {
      setOverride({ ...state, signature, all: false });
      toast({ tone: 'error', title: 'Could not mark these as read', description: result.error });
      return;
    }
    router.refresh();
  }

  async function onDelete(id: string) {
    setBusy(id);
    setOverride({ ...state, signature, removed: new Set(state.removed).add(id) });

    const result = await deleteNotification(id);
    setBusy(null);

    if (!result.ok) {
      const removed = new Set(state.removed);
      removed.delete(id);
      setOverride({ ...state, signature, removed });
      toast({ tone: 'error', title: 'Could not remove that', description: result.error });
      return;
    }
    router.refresh();
  }

  // Reachable after the last row is dismissed, without a round trip to the
  // server for a page that is now empty.
  if (visible.length === 0) {
    return (
      <p className="rounded-card border border-ink-200 bg-white px-4 py-10 text-center text-sm text-ink-500">
        Your notifications are cleared.
      </p>
    );
  }

  return (
    <div>
      {unreadCount > 0 ? (
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm text-ink-600">
            {unreadCount} unread
          </p>
          <button
            type="button"
            onClick={onMarkAll}
            className="inline-flex items-center gap-1.5 rounded-field border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 transition-colors hover:bg-ink-50"
          >
            <CheckCheck className="size-3.5" aria-hidden />
            Mark all read
          </button>
        </div>
      ) : null}

      <ul className="overflow-hidden rounded-card border border-ink-200 bg-white">
        {visible.map((notification) => {
          const read = isRead(notification);

          return (
            <li
              key={notification.id}
              className={cn(
                'flex gap-3 border-b border-ink-100 p-4 last:border-0',
                read ? 'bg-white' : 'bg-brand-50/40',
                busy === notification.id && 'opacity-50',
              )}
            >
              <NotificationIcon type={notification.type} />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <h2
                    className={cn(
                      'text-sm',
                      read ? 'font-medium text-ink-800' : 'font-semibold text-ink-950',
                    )}
                  >
                    {notification.title}
                  </h2>
                  {read ? null : (
                    <span className="inline-flex items-center gap-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-brand-700">
                      <span className="size-1.5 rounded-full bg-brand-600" aria-hidden />
                      New
                    </span>
                  )}
                </div>

                {notification.message ? (
                  <p className="mt-1 text-sm text-ink-600">{notification.message}</p>
                ) : null}

                <p className="mt-1.5 text-xs text-ink-400">
                  {/* Relative for scanning, exact on hover for the one time it matters. */}
                  <time dateTime={notification.created_at} title={formatDateTime(notification.created_at)}>
                    {formatRelative(notification.created_at)}
                  </time>
                </p>

                <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
                  {notification.link ? (
                    <Link
                      href={notification.link}
                      onClick={() => {
                        if (!read) void onMarkRead(notification.id);
                      }}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 transition-colors hover:text-brand-800"
                    >
                      Open
                      <ArrowRight className="size-3.5" aria-hidden />
                    </Link>
                  ) : null}

                  {read ? null : (
                    <button
                      type="button"
                      onClick={() => onMarkRead(notification.id)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-ink-600 transition-colors hover:text-ink-900"
                    >
                      <Check className="size-3.5" aria-hidden />
                      Mark read
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onDelete(notification.id)}
                    disabled={busy === notification.id}
                    className="inline-flex items-center gap-1 text-xs font-medium text-ink-500 transition-colors hover:text-red-600 disabled:opacity-60"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                    Remove
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
