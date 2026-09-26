import type { Metadata } from 'next';
import { ShieldCheck } from 'lucide-react';
import { SiteHeader } from '@/components/layout/site-header';
import { AdminNav } from '@/components/admin/admin-nav';
import { requireAdmin } from '@/lib/auth/session';
import { getQueueCounts } from '@/lib/admin/queries';

export const metadata: Metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
};

/**
 * §16 — the moderation console.
 *
 * `requireAdmin` runs here even though middleware already guards `/admin`:
 * middleware only knows whether somebody is signed in, not whether they are
 * an admin, and it can be bypassed by a direct RSC request. The database
 * refuses the writes regardless, but a non-admin should never get as far as
 * seeing the queues.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const counts = await getQueueCounts();

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main id="main" className="flex-1 bg-ink-50">
        <div className="container-page py-8 lg:py-10">
          <div className="mb-6 flex items-center gap-2.5">
            <span className="inline-flex size-8 items-center justify-center rounded-lg bg-ink-900 text-white">
              <ShieldCheck className="size-4" aria-hidden />
            </span>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Admin console</h1>
              <p className="text-xs text-ink-500">
                Decisions here are visible to sellers and affect live listings.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[14rem_minmax(0,1fr)]">
            <AdminNav counts={counts} />
            <div className="min-w-0">{children}</div>
          </div>
        </div>
      </main>
    </div>
  );
}
