'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NavLink } from '@/components/layout/mobile-nav';

/**
 * The "Browse" group in the primary nav.
 *
 * Five top-level links (Buy, Rent, PG & Co-living, New projects, All
 * properties) crowded the row and read as five equal choices, which they are
 * not: Buy, Rent and New projects are the three journeys people arrive with.
 * The other two are narrower, so they fold in here instead of competing for
 * the same horizontal space.
 *
 * Nothing is removed — every link is still one click away, and the mobile
 * sheet and footer continue to list them flat, because a dropdown is a desktop
 * answer to a desktop problem.
 *
 * Dismissal behaviour is copied from the account menu on purpose: outside
 * pointer-down and Escape both close it, so the two menus in the same header
 * do not behave differently.
 */
export function NavBrowseMenu({ label, links }: { label: string; links: NavLink[] }) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

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

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-1 rounded-lg px-3 py-2 text-[0.9375rem] font-medium text-ink-700 transition-colors hover:bg-ink-100 hover:text-ink-950"
      >
        {label}
        <ChevronDown
          className={cn('size-4 text-ink-500 transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          role="menu"
          className="animate-fade-up absolute left-0 z-50 mt-2 w-56 overflow-hidden rounded-card border border-ink-200 bg-white py-1 shadow-pop"
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50 hover:text-ink-950"
            >
              {link.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
