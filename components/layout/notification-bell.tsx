'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatRelative } from '@/lib/format';
import { useToast } from '@/components/ui/toast';
import { NotificationIcon } from '@/components/notifications/notification-icon';
import { markAllNotificationsRead, markNotificationRead } from '@/lib/notifications/actions';
import type { NotificationRow } from '@/lib/notifications/queries';

/**
 * §19 — the bell.
 *
 * Its preview arrives as props from the header, which is a Server Component,
 * so opening the menu costs nothing and the app needs no API route to feed it.
 *
 * Marking as read is optimistic. It is not a decision anyone regrets, and a
 * spinner on a dot draws more attention to the mechanism than to the news.
 */
export function NotificationBell({ items, unread }: { items: NotificationRow[]; unread: number }) {
  const router = useRouter();
  const toast = useToast();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [open, setOpen] = React.useState(false);

  /**
   * Optimistic reads, tied to the props that produced them.
   *
   * The header re-renders on every navigation and every `router.refresh()`, so
   * this state has to expire rather than accumulate — otherwise a stale "all
   * read" flag would hide a notification that arrived afterwards. Keying the
   * override on a signature of the props means any server update discards it,
   * which is the behaviour we want: the server is the authority, and this is
   * only covering the few hundred milliseconds before it answers.
   */
  const signature = `${unread}|${items.map((n) => `${n.id}:${n.is_read}`).join(',')}`;
  const [override, setOverride] = React.useState({ signature, read: new Set<string>(), all: false });
  const optimistic =
    override.signature === signature
      ? override
      : { signature, read: new Set<string>(), all: false };

  React.useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function isRead(notification: NotificationRow) {
    return notification.is_read || optimistic.all || optimistic.read.has(notification.id);
  }

  // Only the previewed rows can be marked read from here, so the badge counts
  // down from the server's number rather than being recomputed from `items` —
  // there may be more unread than the eight on show.
  const markedHere = items.filter((n) => !n.is_read && optimistic.read.has(n.id)).length;
  const badge = optimistic.all ? 0 : Math.max(0, unread - markedHere);

  function onOpen(notification: NotificationRow) {
    setOpen(false);
    if (isRead(notification)) return;

    setOverride({
      signature,
      read: new Set(optimistic.read).add(notification.id),
      all: optimistic.all,
    });

    // Not awaited: the click is a navigation, and the read flag catching up a
    // moment later is invisible either way.
    void markNotificationRead(notification.id).then(() => router.refresh());
  }

  async function onMarkAll() {
    setOverride({ signature, read: optimistic.read, all: true });

    const result = await markAllNotificationsRead();
    if (!result.ok) {
      setOverride({ signature, read: optimistic.read, all: false });
      toast({ tone: 'error', title: 'Could not mark these as read', description: result.error });
      return;
    }
    router.refresh();
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={badge > 0 ? `Notifications, ${badge} unread` : 'Notifications'}
        className="relative grid size-10 place-items-center rounded-lg text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
      >
        <Bell className="size-5" aria-hidden />
        {badge > 0 ? (
          <span
            className="absolute right-1 top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[0.625rem] font-bold leading-4 text-white ring-2 ring-white"
            aria-hidden
          >
            {badge > 9 ? '9+' : badge}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          className="animate-fade-up absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-card border border-ink-200 bg-white shadow-pop"
        >
          <div className="flex items-center justify-between gap-2 border-b border-ink-100 px-4 py-3">
            <p className="text-sm font-semibold text-ink-900">Notifications</p>
            {badge > 0 ? (
              <button
                type="button"
                onClick={onMarkAll}
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 transition-colors hover:text-brand-800"
              >
                <CheckCheck className="size-3.5" aria-hidden />
                Mark all read
              </button>
            ) : null}
          </div>

          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-500">
              Nothing yet. Approvals, enquiries and payments show up here.
            </p>
          ) : (
            <ul className="max-h-[22rem] overflow-y-auto">
              {items.map((notification) => {
                const read = isRead(notification);

                const body = (
                  <>
                    <NotificationIcon type={notification.type} />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          'block text-sm',
                          read ? 'font-medium text-ink-700' : 'font-semibold text-ink-950',
                        )}
                      >
                        {notification.title}
                      </span>
                      {notification.message ? (
                        <span className="mt-0.5 line-clamp-2 block text-xs text-ink-500">
                          {notification.message}
                        </span>
                      ) : null}
                      <span className="mt-1 block text-[0.6875rem] text-ink-400">
                        {formatRelative(notification.created_at)}
                      </span>
                    </span>
                    {read ? null : (
                      <span
                        className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-600"
                        aria-label="Unread"
                      />
                    )}
                  </>
                );

                const className = cn(
                  'flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-ink-50',
                  !read && 'bg-brand-50/40',
                );

                return (
                  <li key={notification.id} className="border-b border-ink-100 last:border-0">
                    {/*
                      Most notifications carry a deep link and should behave like
                      one. The ones that do not — a plain system notice — still
                      need to be markable, so they render as a button rather
                      than as a link to nowhere.
                    */}
                    {notification.link ? (
                      <Link
                        href={notification.link}
                        role="menuitem"
                        onClick={() => onOpen(notification)}
                        className={className}
                      >
                        {body}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => onOpen(notification)}
                        className={className}
                      >
                        {body}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-ink-100 px-4 py-2.5 text-center text-xs font-semibold text-brand-700 transition-colors hover:bg-ink-50"
          >
            See all notifications
          </Link>
        </div>
      ) : null}
    </div>
  );
}
