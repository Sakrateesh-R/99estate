import Link from 'next/link';
import { TriangleAlert } from 'lucide-react';
import {
  ConversionFunnel,
  StatTile,
  ViewsTrend,
} from '@/components/admin/insight-charts';
import { getInsights, type PeriodStats } from '@/lib/admin/insights';
import { formatRupees } from '@/lib/format';
import { propertyPath } from '@/lib/utils';

/**
 * §16 — insights.
 *
 * Built entirely from what the app already records. The headline is the ₹9
 * funnel, because that is the only number that says whether the business model
 * works: plenty of views with no unlocks means the listings are not convincing,
 * and unlocks with no leads would mean something is broken between the two.
 */
export default async function AdminInsightsPage() {
  const insights = await getInsights();
  const { today, week, month, allTime } = insights;

  const periods: { label: string; stats: PeriodStats }[] = [
    { label: 'Today', stats: today },
    { label: 'Last 7 days', stats: week },
    { label: 'Last 30 days', stats: month },
  ];

  return (
    <div>
      <h1 className="text-base font-semibold text-ink-900">Insights</h1>
      <p className="mt-0.5 text-xs text-ink-500">
        Unique visitors, unlocks and revenue. Counts of people, never a list of them — the visitor
        fingerprint is a one-way hash kept only to avoid counting the same person twice a day.
      </p>

      {insights.truncated ? (
        <p className="mt-4 flex items-start gap-2 rounded-card border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            Volume has outgrown the per-window read cap, so these figures are partial. Worth moving
            the aggregation into SQL.
          </span>
        </p>
      ) : null}

      {/* --- Headline tiles ---------------------------------------------- */}
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Unique visitors today"
          value={today.views.toLocaleString('en-IN')}
          sub={`${week.views.toLocaleString('en-IN')} this week`}
          tone="brand"
        />
        <StatTile
          label="Revenue, 30 days"
          value={formatRupees(month.revenue)}
          sub={`${month.paidUnlocks} paid unlock${month.paidUnlocks === 1 ? '' : 's'}`}
          tone="brand"
        />
        <StatTile
          label="Live listings"
          value={allTime.published.toLocaleString('en-IN')}
          sub={`${month.newListings} added in 30 days`}
        />
        <StatTile
          label="Registered users"
          value={allTime.users.toLocaleString('en-IN')}
          sub={`${month.newUsers} joined in 30 days`}
        />
      </div>

      {/* --- Charts ------------------------------------------------------- */}
      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ViewsTrend data={insights.trend} />
        <ConversionFunnel views={month.views} unlocks={month.unlocks} leads={month.leads} />
      </div>

      {/* --- Per-period table -------------------------------------------- */}
      <h2 className="mt-8 text-sm font-semibold text-ink-900">By period</h2>
      <div className="mt-3 overflow-x-auto rounded-card border border-ink-200 bg-white">
        <table className="w-full min-w-[40rem] text-sm">
          <caption className="sr-only">Platform activity by period</caption>
          <thead>
            <tr className="border-b border-ink-200 bg-ink-50 text-left text-xs uppercase tracking-wide text-ink-500">
              <th scope="col" className="px-4 py-2.5 font-medium">Period</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Visitors</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Signed in</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Unlocks</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Paid</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Leads</th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {periods.map(({ label, stats }) => (
              <tr key={label} className="border-b border-ink-100 last:border-0">
                <th scope="row" className="px-4 py-3 text-left font-medium text-ink-900">
                  {label}
                </th>
                <td className="px-3 py-3 tabular-nums text-ink-700">{stats.views}</td>
                {/*
                  Signed-in and anonymous as plain numbers rather than a split
                  bar: two segments would need a second colour, and the only one
                  that passes contrast here is the reserved status amber.
                */}
                <td className="px-3 py-3 text-ink-700">
                  <span className="tabular-nums">{stats.viewsSignedIn}</span>
                  <span className="text-ink-400"> / {stats.viewsAnonymous} anon</span>
                </td>
                <td className="px-3 py-3 tabular-nums text-ink-700">{stats.unlocks}</td>
                <td className="px-3 py-3 tabular-nums text-ink-700">{stats.paidUnlocks}</td>
                <td className="px-3 py-3 tabular-nums text-ink-700">{stats.leads}</td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-ink-900">
                  {formatRupees(stats.revenue)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* --- Top listings ------------------------------------------------- */}
      <h2 className="mt-8 text-sm font-semibold text-ink-900">Most viewed listings</h2>
      {insights.topListings.length === 0 || insights.topListings.every((l) => l.views === 0) ? (
        <p className="mt-3 rounded-card border border-ink-200 bg-white px-4 py-6 text-sm text-ink-500">
          Nothing has been viewed yet. Lifetime view counts appear here as soon as buyers start
          opening listings.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-card border border-ink-200 bg-white">
          <table className="w-full min-w-[34rem] text-sm">
            <caption className="sr-only">Listings by lifetime view count</caption>
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50 text-left text-xs uppercase tracking-wide text-ink-500">
                <th scope="col" className="px-4 py-2.5 font-medium">Listing</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Views</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Saves</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Unlocks</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Leads</th>
              </tr>
            </thead>
            <tbody>
              {insights.topListings.map((listing) => (
                <tr key={listing.id} className="border-b border-ink-100 last:border-0">
                  <td className="max-w-xs px-4 py-3">
                    {listing.slug ? (
                      <Link
                        href={propertyPath({ id: listing.id, slug: listing.slug })}
                        className="line-clamp-1 font-medium text-ink-900 hover:text-brand-700 hover:underline"
                      >
                        {listing.title}
                      </Link>
                    ) : (
                      <span className="line-clamp-1 font-medium text-ink-900">{listing.title}</span>
                    )}
                  </td>
                  <td className="px-3 py-3 tabular-nums font-semibold text-ink-900">{listing.views}</td>
                  <td className="px-3 py-3 tabular-nums text-ink-700">{listing.saves}</td>
                  <td className="px-3 py-3 tabular-nums text-ink-700">{listing.unlocks}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-700">{listing.leads}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-6 text-xs text-ink-400">
        {/*
          Said plainly so nobody reads these as site-wide traffic and plans
          against a number that does not mean what they think.
        */}
        These figures cover listing pages only. Views of the home page, search results and static
        pages are not recorded anywhere.
      </p>
    </div>
  );
}
