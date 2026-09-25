import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { DashboardNav } from '@/components/dashboard/dashboard-nav';
import { requireProfile } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: 'Dashboard',
  robots: { index: false, follow: false },
};

/**
 * Authenticated seller area.
 *
 * Middleware already redirects signed-out visitors, but `requireProfile` runs
 * here too: middleware can be bypassed (direct RSC requests, a stale matcher),
 * and every page below assumes a profile exists.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main id="main" className="flex-1 bg-ink-50">
        <div className="container-page py-8 lg:py-10">
          {!profile.is_profile_complete ? (
            <div className="mb-6 rounded-card border border-amber-200 bg-amber-50 px-5 py-4">
              <p className="text-sm font-semibold text-amber-900">Finish setting up your profile</p>
              <p className="mt-1 text-sm text-amber-800">
                You need a mobile number before you can post a property or unlock a contact.{' '}
                <Link href="/complete-profile" className="font-semibold underline underline-offset-2">
                  Add it now
                </Link>
                .
              </p>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[14rem_minmax(0,1fr)]">
            <DashboardNav />
            <div className="min-w-0">{children}</div>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
