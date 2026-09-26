'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BadgeCheck, Building2, ChartLine, Flag, Handshake, LayoutDashboard, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { QueueCounts } from '@/lib/admin/queries';

/**
 * The badge on each item is the queue depth, not a notification.
 *
 * A moderation console is only useful if it says what is waiting before it is
 * opened — an admin should not have to click four tabs to discover all four
 * are empty.
 */
const ITEMS: {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  count?: (c: QueueCounts) => number;
}[] = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/admin/properties', label: 'Listings', icon: Building2, count: (c) => c.pendingProperties },
  { href: '/admin/listings', label: 'Posted on behalf', icon: Handshake },
  { href: '/admin/reports', label: 'Reports', icon: Flag, count: (c) => c.openReports },
  { href: '/admin/verification', label: 'Verification', icon: BadgeCheck, count: (c) => c.pendingVerifications },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/insights', label: 'Insights', icon: ChartLine },
];

export function AdminNav({ counts }: { counts: QueueCounts }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin" className="min-w-0 lg:sticky lg:top-24 lg:self-start">
      <ul className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0">
        {ITEMS.map(({ href, label, icon: Icon, exact, count }) => {
          const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
          const n = count?.(counts) ?? 0;

          return (
            <li key={href} className="shrink-0 lg:shrink">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors',
                  active ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
                )}
              >
                <Icon
                  className={cn('size-4', active ? 'text-white' : 'text-ink-400')}
                  aria-hidden
                />
                {label}
                {n > 0 ? (
                  <span
                    className={cn(
                      'ml-auto inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[0.6875rem] font-semibold leading-none',
                      active ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-900',
                    )}
                    aria-label={`${n} waiting`}
                  >
                    {n > 99 ? '99+' : n}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
