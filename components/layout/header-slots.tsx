import Link from 'next/link';
import { Heart } from 'lucide-react';
import { UserMenu } from '@/components/layout/user-menu';
import { NotificationBell } from '@/components/layout/notification-bell';
import { HeaderSearch } from '@/components/layout/header-search';
import { GoogleSignInButton } from '@/components/auth/google-sign-in-button';
import { ButtonLink } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getAuthContext } from '@/lib/auth/session';
import { getDailyContactUsage, freeQuotaLabel } from '@/lib/contacts/usage';
import { getNotificationInbox } from '@/lib/notifications/queries';
import { getActiveCities } from '@/lib/properties/queries';

/**
 * The parts of the header that need a database round trip, split out so they can
 * stream behind Suspense instead of holding the page hostage.
 *
 * This is why route-level `loading.tsx` appeared to do nothing. The header used
 * to await auth, then the quota, the city list and the notification inbox — two
 * sequential waves of network calls in a layout. Nothing can flush until a
 * layout has rendered, so the browser received no HTML at all for well over a
 * second and then got the skeleton and the real content almost together. The
 * loader was working; there was simply no shell for it to appear inside.
 *
 * Each slot below fetches its own data. `getAuthContext` is wrapped in React
 * `cache`, so the slots that need the same session share one request rather than
 * repeating it.
 */

/** Free-unlock counter, saved shortcut and the notification bell. */
export async function HeaderQuickLinks() {
  const { user } = await getAuthContext();
  if (!user) return null;

  const [usage, inbox] = await Promise.all([getDailyContactUsage(), getNotificationInbox()]);

  return (
    <>
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

      <Link
        href="/saved"
        className="hidden size-10 place-items-center rounded-lg text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900 sm:grid"
        aria-label="Saved properties"
      >
        <Heart className="size-5" />
      </Link>

      {/* Shown at every width, unlike the saved-properties shortcut: an unread
          approval or enquiry is news, and news should not be something only
          desktop users find out about. */}
      {inbox ? <NotificationBell items={inbox.items} unread={inbox.unread} /> : null}
    </>
  );
}

/** Avatar menu when signed in, a sign-in link when not. */
export async function HeaderAccountMenu() {
  const { user, profile } = await getAuthContext();

  if (user && profile) {
    return (
      <UserMenu
        profile={{
          fullName: profile.full_name,
          email: profile.email,
          avatarUrl: profile.avatar_url,
          isAdmin: profile.role === 'admin',
        }}
      />
    );
  }

  return (
    <Link
      href="/login"
      className="hidden rounded-field px-3 py-2 text-sm font-semibold text-ink-800 transition-colors hover:bg-ink-100 lg:inline-flex"
    >
      Sign in
    </Link>
  );
}

/**
 * What the mobile sheet shows at the bottom. Its fallback is `null` rather than
 * a placeholder because the sheet is closed until tapped — by which time this
 * has long since resolved.
 */
export async function MobileAuthSlot() {
  const { user } = await getAuthContext();

  return user ? (
    <ButtonLink href="/dashboard" variant="outline" fullWidth>
      Go to dashboard
    </ButtonLink>
  ) : (
    <GoogleSignInButton />
  );
}

/**
 * The persistent search row. The city list is fetched here rather than in the
 * header so it cannot delay the shell — it feeds a datalist nobody can interact
 * with in the first few hundred milliseconds anyway.
 */
export async function HeaderSearchSlot() {
  const cities = await getActiveCities();
  return <HeaderSearch cities={cities} />;
}

/**
 * Holds the width of the account controls while they load, so the logo and nav
 * do not shift sideways when the avatar arrives.
 */
export function HeaderAccountFallback() {
  return (
    <>
      <Skeleton className="hidden size-10 rounded-lg sm:block" />
      <Skeleton className="size-9 rounded-full" />
    </>
  );
}
