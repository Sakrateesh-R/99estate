'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type NavLink = { href: string; label: string };

/**
 * Mobile drawer. The auth controls are rendered on the server and handed in as
 * `authSlot`, so the Google sign-in Server Action never has to cross into a
 * client component.
 */
export function MobileNav({
  links,
  authSlot,
  secondaryLinks = [],
}: {
  links: NavLink[];
  authSlot: React.ReactNode;
  secondaryLinks?: NavLink[];
}) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();

  // Route change closes the drawer.
  //
  // Not sufficient on its own: tapping a link to the page you are already on
  // does not change `pathname`, so the effect never fires and the drawer sits
  // there looking broken. The nav below also closes on any click.
  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  React.useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="grid size-10 place-items-center rounded-lg text-ink-700 transition-colors hover:bg-ink-100 md:hidden"
        aria-label="Open menu"
        aria-expanded={open}
      >
        <Menu className="size-5" />
      </button>

      {open ? (
        <div className="fixed inset-0 z-[70] md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-ink-950/50"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            tabIndex={-1}
          />

          <div className="absolute inset-y-0 right-0 flex w-[min(20rem,85%)] flex-col bg-white shadow-pop">
            <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
              <span className="text-sm font-semibold text-ink-500">Menu</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="-m-1.5 rounded p-1.5 text-ink-500 transition-colors hover:bg-ink-100"
                aria-label="Close menu"
                autoFocus
              >
                <X className="size-5" />
              </button>
            </div>

            <nav
              className="flex-1 overflow-y-auto px-3 py-4"
              onClick={(event) => {
                // Close on any link tap, including same-route links.
                if ((event.target as HTMLElement).closest('a')) setOpen(false);
              }}
            >
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'block rounded-lg px-3 py-3 text-base font-medium transition-colors',
                    pathname === link.href
                      ? 'bg-brand-50 text-brand-800'
                      : 'text-ink-800 hover:bg-ink-50',
                  )}
                >
                  {link.label}
                </Link>
              ))}

              {secondaryLinks.length > 0 ? (
                <div className="mt-3 border-t border-ink-100 pt-3">
                  {secondaryLinks.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="block rounded-lg px-3 py-2.5 text-sm text-ink-600 transition-colors hover:bg-ink-50"
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </nav>

            <div className="border-t border-ink-100 p-4">{authSlot}</div>
          </div>
        </div>
      ) : null}
    </>
  );
}
