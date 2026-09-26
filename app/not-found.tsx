import type { Metadata } from 'next';
import Link from 'next/link';
import { Compass, Home, Search } from 'lucide-react';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';

export const metadata: Metadata = {
  title: 'Page not found',
  // A 404 must never be indexed, and it must not pass authority onward either.
  robots: { index: false, follow: false },
};

/**
 * §23 — the 404.
 *
 * There was no `not-found.tsx`, so every dead URL — a mistyped address, a
 * removed listing, a stale link from elsewhere — rendered Next's unstyled
 * default: a bare line of text, no header, no way onward. A crawler reads that
 * as a thin page on a real site, and a visitor reads it as the site being
 * broken.
 *
 * It returns a genuine 404 status, which matters more than how it looks.
 * Serving a "not found" message with a 200 is a soft 404: Google indexes the
 * page, then reports the whole pattern as a quality problem.
 *
 * The links out are deliberately few and concrete. A wall of suggestions on a
 * 404 is a doorway page wearing an apology.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main id="main" className="flex-1 bg-ink-50">
        <div className="container-page flex flex-col items-center py-20 text-center lg:py-28">
          <span className="grid size-14 place-items-center rounded-full bg-white text-ink-400 ring-1 ring-ink-200">
            <Compass className="size-6" aria-hidden />
          </span>

          <p className="mt-6 text-sm font-semibold uppercase tracking-wider text-brand-700">
            404
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink-950 sm:text-3xl">
            We could not find that page
          </h1>
          <p className="mt-3 max-w-md text-[0.9375rem] text-ink-600">
            The address may be mistyped, or the listing may have been sold, rented or taken down by
            its owner.
          </p>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
            <Link
              href="/properties"
              className="inline-flex items-center gap-1.5 rounded-field bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-800"
            >
              <Search className="size-4" aria-hidden />
              Search properties
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-field border border-ink-200 bg-white px-4 py-2.5 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-100"
            >
              <Home className="size-4" aria-hidden />
              Go to the home page
            </Link>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
