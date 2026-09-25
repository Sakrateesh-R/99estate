'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, Inbox, LayoutDashboard, Plus, User2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const ITEMS: { href: string; label: string; icon: LucideIcon; exact?: boolean; badge?: boolean }[] = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/properties', label: 'My properties', icon: Building2 },
  { href: '/dashboard/leads', label: 'Enquiries', icon: Inbox, badge: true },
  { href: '/dashboard/properties/new', label: 'Add property', icon: Plus, exact: true },
  { href: '/dashboard/profile', label: 'Profile', icon: User2, exact: true },
];

/**
 * `newLeads` is passed in from the layout rather than fetched here — this is a
 * Client Component, and the count is the one thing on the nav that has to be
 * true on first paint. A seller who does not know an enquiry is waiting has
 * no reason to open the page.
 */
export function DashboardNav({ newLeads = 0 }: { newLeads?: number }) {
  const pathname = usePathname();

  function isActive(href: string, exact?: boolean) {
    return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <nav aria-label="Dashboard" className="min-w-0 lg:sticky lg:top-24 lg:self-start">
      {/* Horizontal scroller on small screens, vertical rail from `lg`. */}
      <ul className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0">
        {ITEMS.map(({ href, label, icon: Icon, exact, badge }) => {
          const active = isActive(href, exact);
          const count = badge ? newLeads : 0;
          return (
            <li key={href} className="shrink-0 lg:shrink">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-brand-50 text-brand-800'
                    : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
                )}
              >
                <Icon className={cn('size-4', active ? 'text-brand-700' : 'text-ink-400')} aria-hidden />
                {label}
                {count > 0 ? (
                  <span
                    className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 py-0.5 text-[0.6875rem] font-semibold leading-none text-white"
                    aria-label={`${count} new`}
                  >
                    {count > 99 ? '99+' : count}
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
