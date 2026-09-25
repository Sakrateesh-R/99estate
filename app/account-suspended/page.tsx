import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { Logo } from '@/components/layout/logo';
import { Button, ButtonLink } from '@/components/ui/button';
import { signOut } from '@/lib/auth/actions';
import { SITE_NAME } from '@/lib/constants';

export const metadata: Metadata = {
  title: 'Account suspended',
  robots: { index: false, follow: false },
};

/**
 * Where `requireProfile()` sends a user whose `account_status` is `suspended`.
 *
 * Deliberately outside the normal chrome and outside the protected-route
 * matcher: a suspended user must be able to reach this page and sign out
 * without being bounced around a redirect loop.
 */
export default function AccountSuspendedPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-ink-50">
      <header className="border-b border-ink-200 bg-white">
        <div className="container-page flex h-16 items-center">
          <Logo />
        </div>
      </header>

      <main id="main" className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded-card border border-ink-200 bg-white p-6 shadow-card sm:p-8">
          <span className="grid size-12 place-items-center rounded-2xl bg-red-50 text-red-600">
            <ShieldAlert className="size-6" aria-hidden />
          </span>

          <h1 className="mt-5 text-2xl font-bold tracking-tight">Your account is suspended</h1>
          <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-ink-600">
            You cannot post properties or unlock seller contacts while this is in place. Any
            listings you had have been taken off the market.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-ink-600">
            If you believe this is a mistake, reply to the email we sent you, or contact our
            support team and we will review it.
          </p>

          <div className="mt-7 space-y-2.5">
            <ButtonLink href="/properties" variant="outline" fullWidth>
              Browse properties
            </ButtonLink>

            <form action={signOut}>
              <Button type="submit" variant="ghost" fullWidth>
                Sign out
              </Button>
            </form>
          </div>

          <p className="mt-6 text-xs text-ink-500">
            Browsing {SITE_NAME} remains free and open — suspension only affects posting and
            contacting.{' '}
            <Link href="/" className="font-medium text-ink-700 underline underline-offset-2">
              Back to home
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
