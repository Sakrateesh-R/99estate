import type { Metadata } from 'next';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { EmptyState } from '@/components/ui/empty-state';
import { NotificationList } from '@/components/notifications/notification-list';
import { getNotifications } from '@/lib/notifications/queries';
import { requireProfile } from '@/lib/auth/session';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Notifications',
  robots: { index: false, follow: false },
};

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * §19 — the whole inbox.
 *
 * Not under /dashboard, and deliberately: the dashboard is the seller area,
 * while notifications reach buyers too — a contact unlock, a payment, a saved
 * listing whose price moved. Putting it there would file a buyer's notices
 * under a heading that does not describe them.
 *
 * `requireProfile` rather than `requireUser`: this is the belt to middleware's
 * braces, and it also bounces a suspended account, which should not be reading
 * platform mail as though nothing happened.
 */
export default async function NotificationsPage({ searchParams }: PageProps) {
  await requireProfile();

  const raw = (await searchParams).show;
  const unreadOnly = (Array.isArray(raw) ? raw[0] : raw) === 'unread';

  const notifications = await getNotifications(unreadOnly);

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main id="main" className="flex-1 bg-ink-50">
        <div className="container-page max-w-3xl py-8 lg:py-10">
          <h1 className="text-lg font-bold tracking-tight text-ink-950">Notifications</h1>
          <p className="mt-0.5 text-sm text-ink-500">
            Approvals, enquiries, payments and listings about to expire.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-1.5">
            {[
              { key: '', label: 'All' },
              { key: 'unread', label: 'Unread' },
            ].map((tab) => {
              const active = (tab.key === 'unread') === unreadOnly;
              return (
                <Link
                  key={tab.key || 'all'}
                  href={tab.key ? '/notifications?show=unread' : '/notifications'}
                  aria-current={active ? 'true' : undefined}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                    active
                      ? 'bg-ink-900 text-white'
                      : 'bg-ink-100 text-ink-600 hover:bg-ink-200 hover:text-ink-900',
                  )}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>

          <div className="mt-5">
            {notifications.length === 0 ? (
              <EmptyState
                icon={<Bell className="size-6" />}
                title={unreadOnly ? 'Nothing unread' : 'No notifications yet'}
                description={
                  unreadOnly
                    ? 'You are up to date.'
                    : 'When a listing is approved, a buyer enquires or a payment goes through, you will hear about it here.'
                }
              />
            ) : (
              <NotificationList items={notifications} />
            )}
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
