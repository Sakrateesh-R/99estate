import Image from 'next/image';
import Link from 'next/link';
import { CheckCircle2, ImageIcon } from 'lucide-react';
import { DecisionButtons } from '@/components/admin/decision-buttons';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { getModerationQueue } from '@/lib/admin/queries';
import { approveProperty, rejectProperty } from '@/lib/admin/actions';
import { propertyPath } from '@/lib/utils';
import { formatListingPrice, formatRelative } from '@/lib/format';
import { LISTING_TYPE_LABELS, PROPERTY_TYPE_LABELS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { Enums } from '@/types/database.types';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const TABS: { key: Enums<'property_status'>; label: string }[] = [
  { key: 'pending', label: 'Awaiting review' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'published', label: 'Live' },
];

/**
 * §16 — the listing moderation queue.
 *
 * A reviewer needs enough to judge without opening the listing: the photo,
 * the price, where it is, and how long it has been waiting. The full page is
 * one click away for anything that needs a closer look.
 */
export default async function AdminPropertiesPage({ searchParams }: PageProps) {
  const raw = (await searchParams).status;
  const requested = (Array.isArray(raw) ? raw[0] : raw) ?? 'pending';
  const status = (TABS.find((t) => t.key === requested)?.key ?? 'pending') as Enums<'property_status'>;

  const rows = await getModerationQueue(status);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={`/admin/properties?status=${tab.key}`}
            aria-current={status === tab.key ? 'true' : undefined}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              status === tab.key
                ? 'bg-ink-900 text-white'
                : 'bg-ink-100 text-ink-600 hover:bg-ink-200 hover:text-ink-900',
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<CheckCircle2 className="size-6" />}
          title={status === 'pending' ? 'Nothing awaiting review' : 'Nothing here'}
          description={
            status === 'pending'
              ? 'Listings submitted by sellers appear here for approval.'
              : 'No listings with this status.'
          }
        />
      ) : (
        <ul className="mt-5 space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-card border border-ink-200 bg-white p-4">
              <div className="flex gap-4">
                <div className="relative size-20 shrink-0 overflow-hidden rounded-field bg-ink-100 sm:size-24">
                  {row.cover_image_url ? (
                    <Image
                      src={row.cover_image_url}
                      alt=""
                      fill
                      sizes="96px"
                      className="object-cover"
                    />
                  ) : (
                    <span className="flex h-full items-center justify-center text-ink-300">
                      <ImageIcon className="size-5" aria-hidden />
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="truncate font-semibold text-ink-900">
                        {row.slug ? (
                          <Link
                            href={propertyPath({ id: row.id, slug: row.slug })}
                            className="hover:text-brand-700 hover:underline"
                          >
                            {row.title}
                          </Link>
                        ) : (
                          row.title
                        )}
                      </h2>
                      <p className="mt-0.5 truncate text-sm text-ink-500">
                        {[row.locality, row.city].filter(Boolean).join(', ')} ·{' '}
                        {PROPERTY_TYPE_LABELS[row.property_type]} ·{' '}
                        {LISTING_TYPE_LABELS[row.listing_type]}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold text-ink-900">
                        {formatListingPrice(row.price, row.listing_type)}
                      </p>
                      <p className="text-xs text-ink-400">
                        Submitted {formatRelative(row.created_at)}
                      </p>
                    </div>
                  </div>

                  {row.rejection_reason ? (
                    <p className="mt-2 rounded-field bg-red-50 px-3 py-2 text-xs text-red-800">
                      <span className="font-semibold">Rejected:</span> {row.rejection_reason}
                    </p>
                  ) : null}

                  <div className="mt-3">
                    {status === 'pending' ? (
                      <DecisionButtons
                        onApprove={approveProperty.bind(null, row.id)}
                        onReject={(reason) => rejectProperty(row.id, reason)}
                        approveLabel="Approve and publish"
                        approveToast="Listing is live"
                      />
                    ) : status === 'rejected' ? (
                      <DecisionButtons
                        onApprove={approveProperty.bind(null, row.id)}
                        onReject={(reason) => rejectProperty(row.id, reason)}
                        approveLabel="Approve anyway"
                        rejectLabel="Update reason"
                        approveToast="Listing is live"
                        rejectToast="Reason updated"
                      />
                    ) : (
                      <Badge tone="success">Live</Badge>
                    )}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
