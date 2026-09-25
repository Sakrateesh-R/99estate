'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, LayoutDashboard, Plus, User2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const ITEMS: { href: string; label: string; icon: LucideIcon; exact?: boolean }[] = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/properties', label: 'My properties', icon: Building2 },
  { href: '/dashboard/properties/new', label: 'Add property', icon: Plus, exact: true },
  { href: '/dashboard/profile', label: 'Profile', icon: User2, exact: true },
];

export function DashboardNav() {
  const pathname = usePathname();

  function isActive(href: string, exact?: boolean) {
    return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <nav aria-label="Dashboard" className="min-w-0 lg:sticky lg:top-24 lg:self-start">
      {/* Horizontal scroller on small screens, vertical rail from `lg`. */}
      <ul className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0">
        {ITEMS.map(({ href, label, icon: Icon, exact }) => {
          const active = isActive(href, exact);
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
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
