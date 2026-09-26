import Link from 'next/link';
import { Suspense } from 'react';
import { Plus, Sparkles } from 'lucide-react';
import { Logo } from '@/components/layout/logo';
import { MobileNav, type NavLink } from '@/components/layout/mobile-nav';
import {
  HeaderAccountFallback,
  HeaderAccountMenu,
  HeaderQuickLinks,
  HeaderSearchSlot,
  MobileAuthSlot,
} from '@/components/layout/header-slots';
import { ButtonLink } from '@/components/ui/button';
import { FREE_DAILY_UNLOCKS, PAID_UNLOCK_PRICE } from '@/lib/constants';

const PRIMARY_LINKS: NavLink[] = [
  { href: '/properties?listing=sale', label: 'Buy' },
  { href: '/properties?listing=rent', label: 'Rent' },
  { href: '/properties?listing=pg', label: 'PG & Co-living' },
  { href: '/properties', label: 'All properties' },
];

const SECONDARY_LINKS: NavLink[] = [
  { href: '/dashboard', label: 'Seller dashboard' },
  { href: '/saved', label: 'Saved properties' },
  { href: '/how-it-works', label: 'How 99Estate works' },
];

/**
 * Portal-style header.
 *
 * Two tiers rather than one: identity and account controls on top, a persistent
 * search below. That second row is what makes the site feel like a property
 * portal instead of a SaaS dashboard — a property session is a sequence of
 * searches, so search must never be more than one click away.
 *
 * Deliberately not `async`, and nothing here awaits.
 *
 * This component sits in a layout, and a layout has to finish rendering before
 * anything downstream of it can be sent. When it awaited the session, the quota,
 * the city list and the notification inbox, the browser got no HTML for over a
 * second — which made every route's `loading.tsx` useless, because a loading
 * fallback needs a shell to appear inside. The markup below flushes immediately
 * and each piece of data arrives in its own Suspense boundary.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-ink-200 bg-white">
      {/* USP strip — the pricing model, stated before anything else. */}
      <div className="bg-ink-950 text-white">
        <div className="container-page flex h-9 items-center justify-center gap-2 text-[0.8125rem]">
          <Sparkles className="size-3.5 shrink-0 text-accent-300" aria-hidden />
          <span className="truncate text-ink-200">
            Browse free ·{' '}
            <strong className="font-semibold text-white">
              {FREE_DAILY_UNLOCKS} contacts free every day
            </strong>
            <span className="hidden sm:inline"> · just ₹{PAID_UNLOCK_PRICE} after that</span>
          </span>
        </div>
      </div>

      {/* ---- Tier 1: identity, nav, account ---- */}
      <div className="container-page flex h-16 items-center gap-3">
        <Logo />

        <nav className="ml-3 hidden items-center gap-0.5 lg:flex" aria-label="Primary">
          {PRIMARY_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-[0.9375rem] font-medium text-ink-700 transition-colors hover:bg-ink-100 hover:text-ink-950"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Suspense fallback={null}>
            <HeaderQuickLinks />
          </Suspense>

          {/* Static, and ahead of the account menu in the markup so the main
              call to action is clickable before the session resolves. */}
          <ButtonLink href="/dashboard/properties/new" size="sm" className="hidden sm:inline-flex">
            <Plus className="size-4" aria-hidden />
            Post property
            <span className="ml-1 rounded bg-white/20 px-1.5 py-0.5 text-[0.6875rem] font-bold uppercase tracking-wide">
              Free
            </span>
          </ButtonLink>

          <Suspense fallback={<HeaderAccountFallback />}>
            <HeaderAccountMenu />
          </Suspense>

          <MobileNav
            links={PRIMARY_LINKS}
            secondaryLinks={SECONDARY_LINKS}
            authSlot={
              <Suspense fallback={null}>
                <MobileAuthSlot />
              </Suspense>
            }
          />
        </div>
      </div>

      {/* ---- Tier 2: persistent search. Renders nothing on the home page,
           where the hero carries a larger version of the same control.
           useSearchParams needs a Suspense boundary or the whole tree opts
           into client-side rendering — and the city list streams into the same
           boundary rather than blocking the shell above. ---- */}
      <Suspense fallback={null}>
        <HeaderSearchSlot />
      </Suspense>
    </header>
  );
}
