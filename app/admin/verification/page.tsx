import Link from 'next/link';
import { BadgeCheck, FileText } from 'lucide-react';
import { DecisionButtons } from '@/components/admin/decision-buttons';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { getVerificationRequests } from '@/lib/admin/queries';
import { setVerification } from '@/lib/admin/actions';
import { propertyPath, cn } from '@/lib/utils';
import { formatRelative } from '@/lib/format';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * §16 — verification review.
 *
 * The badge is a claim the platform makes on a seller's behalf, so the bar is
 * the documents, not the listing looking plausible. Document object keys live
 * in a private bucket and are shown as names only — they are never linked
 * publicly, and a signed URL would leak past this page.
 */
export default async function AdminVerificationPage({ searchParams }: PageProps) {
  const raw = (await searchParams).show;
  const showDecided = (Array.isArray(raw) ? raw[0] : raw) === 'decided';

  const requests = await getVerificationRequests(!showDecided);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {[
          { key: 'pending', label: 'Awaiting review' },
          { key: 'decided', label: 'Decided' },
        ].map((tab) => {
          const active = (tab.key === 'decided') === showDecided;
          return (
            <Link
              key={tab.key}
              href={tab.key === 'decided' ? '/admin/verification?show=decided' : '/admin/verification'}
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

      {requests.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<BadgeCheck className="size-6" />}
          title={showDecided ? 'Nothing decided yet' : 'No verification requests'}
          description={
            showDecided
              ? 'Requests you approve or reject appear here.'
              : 'Sellers who submit ownership documents appear here.'
          }
        />
      ) : (
        <ul className="mt-5 space-y-3">
          {requests.map((request) => {
            const documents = Array.isArray(request.documents) ? request.documents : [];

            return (
              <li key={request.id} className="rounded-card border border-ink-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="min-w-0 truncate font-semibold text-ink-900">
                    {request.property_slug ? (
                      <Link
                        href={propertyPath({ id: request.property_id, slug: request.property_slug })}
                        className="hover:text-brand-700 hover:underline"
                      >
                        {request.property_title}
                      </Link>
                    ) : (
                      request.property_title
                    )}
                  </h2>
                  <div className="flex shrink-0 items-center gap-2">
                    {showDecided ? (
                      <Badge tone={request.status === 'verified' ? 'success' : 'danger'}>
                        {request.status === 'verified' ? 'Verified' : 'Rejected'}
                      </Badge>
                    ) : null}
                    <p className="text-xs text-ink-400">
                      Submitted {formatRelative(request.created_at)}
                    </p>
                  </div>
                </div>

                {request.note ? (
                  <blockquote className="mt-2.5 rounded-field bg-ink-50 px-3 py-2 text-sm text-ink-700">
                    {request.note}
                  </blockquote>
                ) : null}

                <div className="mt-3">
                  <p className="text-xs font-medium text-ink-500">
                    {documents.length === 0
                      ? 'No documents attached'
                      : `${documents.length} document${documents.length === 1 ? '' : 's'}`}
                  </p>
                  {documents.length > 0 ? (
                    <ul className="mt-1.5 space-y-1">
                      {documents.map((doc, i) => (
                        <li
                          key={i}
                          className="flex items-center gap-1.5 text-xs text-ink-600"
                        >
                          <FileText className="size-3.5 shrink-0 text-ink-400" aria-hidden />
                          <span className="truncate font-mono">
                            {typeof doc === 'string' ? doc : JSON.stringify(doc)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <p className="mt-1.5 text-[0.6875rem] text-ink-400">
                    Stored in a private bucket. Open them from Supabase Storage to review.
                  </p>
                </div>

                {request.admin_notes ? (
                  <p className="mt-2 text-xs text-ink-500">
                    <span className="font-semibold">Your note:</span> {request.admin_notes}
                  </p>
                ) : null}

                {!showDecided ? (
                  <div className="mt-3">
                    <DecisionButtons
                      onApprove={() => setVerification(request.property_id, 'verified')}
                      onReject={(reason) =>
                        setVerification(request.property_id, 'rejected', reason)
                      }
                      approveLabel="Verify listing"
                      rejectLabel="Reject"
                      reasonLabel="Why the documents were not accepted"
                      reasonPlaceholder="Document was unreadable, name did not match…"
                      approveToast="Listing verified"
                      rejectToast="Verification declined"
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
