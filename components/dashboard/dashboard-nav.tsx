'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Building2,
  Inbox,
  LayoutDashboard,
  LayoutGrid,
  Plus,
  User2,
  KeyRound,
  Landmark,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  badge?: boolean;
  /** Only rendered once the account actually acts for a company. */
  builderOnly?: boolean;
};

const ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/properties', label: 'My properties', icon: Building2 },
  /**
   * No longer `builderOnly`. The flag hid projects until the account already
   * acted for a company, which meant the way to start a project was invisible
   * to everybody who had not yet registered one — and registering one is no
   * longer part of adding a project.
   */
  { href: '/dashboard/projects', label: 'Projects', icon: LayoutGrid },
  { href: '/dashboard/leads', label: 'Enquiries', icon: Inbox, badge: true },
  { href: '/dashboard/contacts', label: 'Unlocked contacts', icon: KeyRound },
  { href: '/dashboard/properties/new', label: 'Add property', icon: Plus, exact: true },
  /* Beside "Add property" and reading the same way: the two things somebody
     can put on the site, offered the same way. */
  { href: '/dashboard/projects/new', label: 'Add project', icon: Plus, exact: true },
  { href: '/dashboard/organization', label: 'My company', icon: Landmark },
  { href: '/dashboard/profile', label: 'Profile', icon: User2, exact: true },
];

/**
 * `newLeads` is passed in from the layout rather than fetched here — this is a
 * Client Component, and the count is the one thing on the nav that has to be
 * true on first paint. A seller who does not know an enquiry is waiting has
 * no reason to open the page.
 *
 * `isBuilder` comes in the same way. "Projects" is hidden until the account
 * actually acts for a company, because a link whose only destination is an
 * empty state is clutter for the owner selling one flat — which is most
 * people. "My company" stays visible for everyone, since that is where the
 * company gets registered in the first place.
 */
export function DashboardNav({
  newLeads = 0,
  isBuilder = false,
}: {
  newLeads?: number;
  isBuilder?: boolean;
}) {
  const pathname = usePathname();

  function isActive(href: string, exact?: boolean) {
    return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  }

  const items = ITEMS.filter((item) => !item.builderOnly || isBuilder);

  return (
    <nav aria-label="Dashboard" className="min-w-0 lg:sticky lg:top-24 lg:self-start">
      {/* Horizontal scroller on small screens, vertical rail from `lg`. */}
      <ul className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0">
        {items.map(({ href, label, icon: Icon, exact, badge }) => {
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
