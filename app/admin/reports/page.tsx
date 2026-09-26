import Link from 'next/link';
import { Flag, TriangleAlert } from 'lucide-react';
import { DecisionButtons } from '@/components/admin/decision-buttons';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { getReports } from '@/lib/admin/queries';
import { resolveReport, rejectProperty } from '@/lib/admin/actions';
import { propertyPath, cn } from '@/lib/utils';
import { formatRelative } from '@/lib/format';
import { REPORT_REASON_LABELS } from '@/lib/constants';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * §16 — reported listings.
 *
 * Two decisions are available and they are not the same one. Dismissing says
 * the listing is fine; resolving says it was dealt with. Taking the listing
 * down is a third action, deliberately separate — most reports do not warrant
 * it, and folding "resolve" and "remove" into one button would make removal
 * the path of least resistance.
 */
export default async function AdminReportsPage({ searchParams }: PageProps) {
  const raw = (await searchParams).show;
  const showResolved = (Array.isArray(raw) ? raw[0] : raw) === 'resolved';

  const reports = await getReports(!showResolved);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {[
          { key: 'open', label: 'Open' },
          { key: 'resolved', label: 'Closed' },
        ].map((tab) => {
          const active = (tab.key === 'resolved') === showResolved;
          return (
            <Link
              key={tab.key}
              href={tab.key === 'resolved' ? '/admin/reports?show=resolved' : '/admin/reports'}
              aria-current={active ? 'true' : undefined}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                active
                  ? 'bg-ink-900 text-white'
                  : 'bg-ink-100 text-ink-600 hover:bg-ink-200 hover:text-ink-900',
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {reports.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<Flag className="size-6" />}
          title={showResolved ? 'No closed reports' : 'No open reports'}
          description={
            showResolved
              ? 'Reports you resolve or dismiss appear here.'
              : 'Listings reported by buyers appear here for review.'
          }
        />
      ) : (
        <ul className="mt-5 space-y-3">
          {reports.map((report) => (
            <li key={report.id} className="rounded-card border border-ink-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="danger">{REPORT_REASON_LABELS[report.reason]}</Badge>
                    {report.report_count > 1 ? (
                      <Badge tone="warning">
                        <TriangleAlert className="size-3.5" aria-hidden />
                        {report.report_count} reports on this listing
                      </Badge>
                    ) : null}
                    {report.property_status !== 'published' ? (
                      <Badge tone="neutral">Listing is {report.property_status}</Badge>
                    ) : null}
                  </div>

                  <h2 className="mt-2 truncate font-semibold text-ink-900">
                    {report.property_slug ? (
                      <Link
                        href={propertyPath({ id: report.property_id, slug: report.property_slug })}
                        className="hover:text-brand-700 hover:underline"
                      >
                        {report.property_title}
                      </Link>
                    ) : (
                      report.property_title
                    )}
                  </h2>
                </div>

                <p className="shrink-0 text-xs text-ink-400">
                  Reported {formatRelative(report.created_at)}
                </p>
              </div>

              {report.description ? (
                <blockquote className="mt-2.5 rounded-field bg-ink-50 px-3 py-2 text-sm text-ink-700">
                  {report.description}
                </blockquote>
              ) : null}

              {report.admin_notes ? (
                <p className="mt-2 text-xs text-ink-500">
                  <span className="font-semibold">Your note:</span> {report.admin_notes}
                </p>
              ) : null}

              {showResolved ? (
                <p className="mt-3 text-xs text-ink-400">
                  {report.status === 'resolved' ? 'Resolved' : 'Dismissed'}
                  {report.resolved_at ? ` ${formatRelative(report.resolved_at)}` : null}
                </p>
              ) : (
                <div className="mt-3 space-y-3">
                  <DecisionButtons
                    onApprove={() => resolveReport(report.id, 'dismissed')}
                    onReject={(note) => resolveReport(report.id, 'resolved', note)}
                    approveLabel="Dismiss — listing is fine"
                    rejectLabel="Mark resolved"
                    reasonLabel="What did you do about it?"
                    reasonPlaceholder="Contacted the seller, price corrected…"
                    requireReason={false}
                    approveToast="Report dismissed"
                    rejectToast="Report closed"
                  />

                  {report.property_status === 'published' ? (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-red-700 hover:underline">
                        Take the listing down
                      </summary>
                      <div className="mt-2 rounded-field border border-red-200 bg-red-50 p-3">
                        <p className="mb-2 text-red-900">
                          This unpublishes the listing and notifies the seller with your reason.
                        </p>
                        <DecisionButtons
                          onApprove={() => resolveReport(report.id, 'under_review')}
                          onReject={async (reason) => {
                            const removed = await rejectProperty(report.property_id, reason);
                            if (!removed.ok) return removed;
                            return resolveReport(report.id, 'resolved', reason);
                          }}
                          approveLabel="Flag for review instead"
                          rejectLabel="Unpublish listing"
                          reasonLabel="Reason the seller will see"
                          approveToast="Flagged for review"
                          rejectToast="Listing unpublished"
                        />
                      </div>
                    </details>
                  ) : null}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
