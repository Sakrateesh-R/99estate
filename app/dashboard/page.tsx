import type { Metadata } from 'next';
import Link from 'next/link';
import { Building2, Eye, KeyRound, Plus, Signal, Sparkles, Users } from 'lucide-react';
import { StatCard } from '@/components/ui/card';
import { ButtonLink } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PropertyStatusBadge } from '@/components/ui/badge';
import { requireProfile } from '@/lib/auth/session';
import { getSellerProperties, getSellerStats } from '@/lib/properties/seller-queries';
import { getDailyContactUsage } from '@/lib/contacts/usage';
import { formatCount, formatListingPrice, formatQuotaReset } from '@/lib/format';
import { FREE_DAILY_UNLOCKS, PAID_UNLOCK_PRICE } from '@/lib/constants';

export const metadata: Metadata = {
  title: 'Dashboard',
  robots: { index: false, follow: false },
};

export default async function DashboardOverviewPage() {
  const profile = await requireProfile();

  const [stats, properties, usage] = await Promise.all([
    getSellerStats(profile.id),
    getSellerProperties(profile.id),
    getDailyContactUsage(),
  ]);

  const firstName = profile.full_name?.split(' ')[0] ?? 'there';
  const recent = properties.slice(0, 5);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Hello, {firstName}</h1>
          <p className="mt-1.5 text-[0.9375rem] text-ink-600">
            {stats.total === 0
              ? 'You have not listed anything yet.'
              : `${stats.active} of your ${stats.total} listing${stats.total === 1 ? '' : 's'} ${stats.active === 1 ? 'is' : 'are'} live right now.`}
          </p>
        </div>
        <ButtonLink href="/dashboard/properties/new">
          <Plus className="size-4" aria-hidden />
          Post property
        </ButtonLink>
      </div>

      {/* Buyer-side quota. It lives on the dashboard because it is per-account,
          not per-listing, and sellers are buyers too. */}
      <div className="mt-6 overflow-hidden rounded-card border border-accent-200 bg-gradient-to-br from-accent-50 to-white">
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-start gap-3.5">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-100 text-accent-700">
              <Sparkles className="size-5" aria-hidden />
            </span>
            <div>
              <p className="text-[0.9375rem] font-semibold text-ink-950">
                {usage
                  ? usage.freeRemaining > 0
                    ? `${usage.freeRemaining} free contact${usage.freeRemaining === 1 ? '' : 's'} left today`
                    : 'Free contacts used for today'
                  : `${FREE_DAILY_UNLOCKS} free contacts every day`}
              </p>
              <p className="mt-0.5 text-sm text-ink-600">
                {usage
                  ? usage.freeRemaining > 0
                    ? `Resets ${formatQuotaReset(usage.resetsAt ?? new Date())} · ₹${PAID_UNLOCK_PRICE} per contact after that.`
                    : `More contacts cost ₹${PAID_UNLOCK_PRICE} each. Your free quota returns ${formatQuotaReset(usage.resetsAt ?? new Date())}.`
                  : `Browsing is always free. Contacts beyond your daily quota cost ₹${PAID_UNLOCK_PRICE}.`}
              </p>
            </div>
          </div>

          {usage ? (
            <div className="flex items-center gap-1.5" aria-hidden>
              {Array.from({ length: usage.freeLimit }, (_, i) => (
                <span
                  key={i}
                  className={`size-3 rounded-full ${i < usage.freeRemaining ? 'bg-accent-500' : 'bg-accent-200'}`}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total properties" value={formatCount(stats.total)} icon={<Building2 className="size-5" />} />
        <StatCard
          label="Active listings"
          value={formatCount(stats.active)}
          hint={stats.pending > 0 ? `${stats.pending} awaiting review` : undefined}
          icon={<Signal className="size-5" />}
          tone="brand"
        />
        <StatCard label="Property views" value={formatCount(stats.views)} icon={<Eye className="size-5" />} />
        <StatCard
          label="Contact unlocks"
          value={formatCount(stats.unlocks)}
          icon={<KeyRound className="size-5" />}
          tone="accent"
        />
        <StatCard label="Leads" value={formatCount(stats.leads)} icon={<Users className="size-5" />} tone="brand" />
      </div>

      <section className="mt-9">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-lg font-semibold">Recent listings</h2>
          {properties.length > recent.length ? (
            <Link
              href="/dashboard/properties"
              className="text-sm font-semibold text-brand-700 transition-colors hover:text-brand-900"
            >
              View all
            </Link>
          ) : null}
        </div>

        {recent.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={<Building2 className="size-6" />}
              title="No listings yet"
              description="Posting is free and always will be. Add your first property to start getting leads."
              action={<ButtonLink href="/dashboard/properties/new">Post a property</ButtonLink>}
            />
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-ink-100 overflow-hidden rounded-card border border-ink-200 bg-white">
            {recent.map((property) => (
              <li key={property.id}>
                <Link
                  href={`/dashboard/properties/${property.id}/edit`}
                  className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-ink-50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink-900">{property.title}</p>
                    <p className="mt-0.5 truncate text-xs text-ink-500">
                      {formatListingPrice(property.price, property.listing_type)} ·{' '}
                      {[property.locality, property.city].filter(Boolean).join(', ')}
                    </p>
                  </div>

                  <div className="hidden shrink-0 gap-5 text-right sm:flex">
                    <span className="text-xs text-ink-500">
                      <span className="block font-semibold tabular-nums text-ink-900">
                        {formatCount(property.views_count)}
                      </span>
                      views
                    </span>
                    <span className="text-xs text-ink-500">
                      <span className="block font-semibold tabular-nums text-ink-900">
                        {formatCount(property.leads_count)}
                      </span>
                      leads
                    </span>
                  </div>

                  <PropertyStatusBadge status={property.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
