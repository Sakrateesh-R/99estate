import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarClock, TriangleAlert, UserRound } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { RenewListings } from '@/components/admin/renew-listings';
import { getExpiringListings } from '@/lib/admin/expiring';
import { formatDate, formatListingPrice } from '@/lib/format';
import { propertyPath, cn } from '@/lib/utils';
import { LISTING_DURATION_DAYS } from '@/lib/constants';

export const metadata: Metadata = {
  title: 'Expiring listings',
  robots: { index: false, follow: false },
};

/**
 * §18 — what is about to drop off the site, and one place to stop it.
 *
 * A listing lives 90 days. The seller-side renew button has always existed and
 * is unreachable for most of this inventory: 34 of 36 listings belong to
 * placeholder accounts created when an admin posted on a walk-in owner's
 * behalf, which cannot sign in at all.
 *
 * Grouped by date rather than listed flat, because the problem is the shape of
 * it. Thirty listings expire across four days in December; seeing "27 Dec — 12
 * listings" is the fact worth acting on, and each group renews in one click.
 */
const WINDOWS = [30, 90, 180];

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AdminExpiringPage({ searchParams }: PageProps) {
  const raw = (await searchParams).days;
  const asked = Number(Array.isArray(raw) ? raw[0] : raw);
  const days = WINDOWS.includes(asked) ? asked : 90;

  const listings = await getExpiringListings(days);

  // Grouped by calendar day, in order. `expiresAt` is already sorted.
  const groups = new Map<string, typeof listings>();
  for (const listing of listings) {
    const day = listing.expiresAt.slice(0, 10);
    groups.set(day, [...(groups.get(day) ?? []), listing]);
  }

  const strandedCount = listings.filter((l) => !l.ownerCanSignIn).length;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Expiring listings</h1>
          <p className="mt-1.5 text-[0.9375rem] text-ink-600">
            Everything due to come off the site in the next {days} days. Renewing gives a listing
            another {LISTING_DURATION_DAYS} days from today.
          </p>
        </div>

        {listings.length > 0 ? (
          <RenewListings
            ids={listings.map((l) => l.id)}
            label={`Renew all ${listings.length}`}
            variant="bulk"
          />
        ) : null}
      </div>

      {strandedCount > 0 ? (
        <p className="mt-5 flex items-start gap-2.5 rounded-card border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            <strong className="font-semibold">{strandedCount}</strong> of these belong to owners who
            cannot sign in — they were posted on their behalf and have no account to renew from. If
            nobody renews here, those listings simply disappear.
          </span>
        </p>
      ) : null}

      {listings.length === 0 ? (
        <EmptyState
          className="mt-8"
          icon={<CalendarClock className="size-6" />}
          title={`Nothing expires in the next ${days} days`}
          description="Listings run for 90 days from the day they go live. This page fills up as that date approaches."
        />
      ) : (
        <div className="mt-7 space-y-8">
          {[...groups.entries()].map(([day, items]) => {
            const soonest = items[0]!;
            return (
              <section key={day}>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-200 pb-2.5">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                    <CalendarClock className="size-4 text-ink-400" aria-hidden />
                    {formatDate(day)}
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-medium',
                        soonest.daysLeft <= 7
                          ? 'bg-red-50 text-red-700'
                          : soonest.daysLeft <= 21
                            ? 'bg-amber-50 text-amber-800'
                            : 'bg-ink-100 text-ink-600',
                      )}
                    >
                      {soonest.daysLeft === 0 ? 'today' : `in ${soonest.daysLeft} days`}
                    </span>
                    <span className="text-ink-500">
                      · {items.length} listing{items.length === 1 ? '' : 's'}
                    </span>
                  </h2>

                  <RenewListings ids={items.map((i) => i.id)} label={`Renew these ${items.length}`} />
                </div>

                <ul className="divide-y divide-ink-100">
                  {items.map((listing) => (
                    <li key={listing.id} className="flex flex-wrap items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <Link
                          href={propertyPath({
                            id: listing.id,
                            slug: listing.slug,
                            public_code: listing.publicCode,
                          })}
                          className="block truncate font-medium text-ink-900 hover:text-brand-700"
                        >
                          {listing.title}
                        </Link>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 truncate text-xs text-ink-500">
                          <span>{formatListingPrice(listing.price, listing.listingType)}</span>
                          <span>·</span>
                          <span>{[listing.locality, listing.city].filter(Boolean).join(', ')}</span>
                          {listing.ownerName ? (
                            <>
                              <span>·</span>
                              <span className="inline-flex items-center gap-1">
                                <UserRound className="size-3" aria-hidden />
                                {listing.ownerName}
                              </span>
                            </>
                          ) : null}
                        </p>
                      </div>

                      {!listing.ownerCanSignIn ? (
                        <Badge tone="neutral">Owner cannot renew</Badge>
                      ) : null}

                      <RenewListings ids={[listing.id]} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
