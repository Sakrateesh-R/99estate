import Link from 'next/link';
import { Suspense } from 'react';
import { Heart, Plus, Sparkles } from 'lucide-react';
import { Logo } from '@/components/layout/logo';
import { UserMenu } from '@/components/layout/user-menu';
import { NotificationBell } from '@/components/layout/notification-bell';
import { MobileNav, type NavLink } from '@/components/layout/mobile-nav';
import { HeaderSearch } from '@/components/layout/header-search';
import { GoogleSignInButton } from '@/components/auth/google-sign-in-button';
import { ButtonLink } from '@/components/ui/button';
import { getAuthContext } from '@/lib/auth/session';
import { getDailyContactUsage, freeQuotaLabel } from '@/lib/contacts/usage';
import { getNotificationInbox } from '@/lib/notifications/queries';
import { getActiveCities } from '@/lib/properties/queries';
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
 * Two tiers rather than one: identity and account controls on top, a
 * persistent search below. That second row is what makes the site feel like a
 * property portal instead of a SaaS dashboard — a property session is a
 * sequence of searches, so search must never be more than one click away.
 */
export async function SiteHeader() {
  const { user, profile } = await getAuthContext();
  const [usage, cities, inbox] = await Promise.all([
    user ? getDailyContactUsage() : Promise.resolve(null),
    getActiveCities(),
    // Signed-out visitors have no inbox, and asking would be a round trip that
    // can only ever come back empty.
    user ? getNotificationInbox() : Promise.resolve(null),
  ]);

  const authSlot = user ? (
    <ButtonLink href="/dashboard" variant="outline" fullWidth>
      Go to dashboard
    </ButtonLink>
  ) : (
    <GoogleSignInButton />
  );

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
          {usage ? (
            <Link
              href="/dashboard"
              className="hidden items-center gap-1.5 rounded-full bg-accent-50 px-3 py-1.5 text-xs font-semibold text-accent-800 ring-1 ring-inset ring-accent-200 transition-colors hover:bg-accent-100 xl:inline-flex"
              title="Your free contact unlocks reset at midnight IST"
            >
              <span className="size-1.5 rounded-full bg-accent-500" aria-hidden />
              {freeQuotaLabel(usage)}
            </Link>
          ) : null}

          {user ? (
            <Link
              href="/saved"
              className="hidden size-10 place-items-center rounded-lg text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900 sm:grid"
              aria-label="Saved properties"
            >
              <Heart className="size-5" />
            </Link>
          ) : null}

          {/* Shown at every width, unlike the saved-properties shortcut: an
              unread approval or enquiry is news, and news should not be
              something only desktop users find out about. */}
          {inbox ? <NotificationBell items={inbox.items} unread={inbox.unread} /> : null}

          <ButtonLink href="/dashboard/properties/new" size="sm" className="hidden sm:inline-flex">
            <Plus className="size-4" aria-hidden />
            Post property
            <span className="ml-1 rounded bg-white/20 px-1.5 py-0.5 text-[0.6875rem] font-bold uppercase tracking-wide">
              Free
            </span>
          </ButtonLink>

          {user && profile ? (
            <UserMenu
              profile={{
                fullName: profile.full_name,
                email: profile.email,
                avatarUrl: profile.avatar_url,
                isAdmin: profile.role === 'admin',
              }}
            />
          ) : (
            <Link
              href="/login"
              className="hidden rounded-field px-3 py-2 text-sm font-semibold text-ink-800 transition-colors hover:bg-ink-100 lg:inline-flex"
            >
              Sign in
            </Link>
          )}

          <MobileNav links={PRIMARY_LINKS} secondaryLinks={SECONDARY_LINKS} authSlot={authSlot} />
        </div>
      </div>

      {/* ---- Tier 2: persistent search. Renders nothing on the home page,
           where the hero carries a larger version of the same control.
           useSearchParams needs a Suspense boundary or the whole tree opts
           into client-side rendering. ---- */}
      <Suspense fallback={null}>
        <HeaderSearch cities={cities} />
      </Suspense>
    </header>
  );
}
