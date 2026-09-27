import Image from 'next/image';
import Link from 'next/link';
import { CheckCircle2, ImageIcon } from 'lucide-react';
import { DecisionButtons } from '@/components/admin/decision-buttons';
import { EmptyState } from '@/components/ui/empty-state';

import { getModerationQueue } from '@/lib/admin/queries';
import { approveProperty, rejectProperty } from '@/lib/admin/actions';
import { propertyPath } from '@/lib/utils';
import { formatListingPrice, formatRelative } from '@/lib/format';
import { LISTING_TYPE_LABELS, PROPERTY_TYPE_LABELS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { Enums } from '@/types/database.types';

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * Live first, because this is no longer a queue.
 *
 * `pending` is kept as a tab only to reach listings stranded there by the old
 * review flow — nothing new can land in it now that sellers publish directly.
 * It can go once the last one is cleared.
 */
const TABS: { key: Enums<'property_status'>; label: string }[] = [
  { key: 'published', label: 'Live' },
  { key: 'rejected', label: 'Taken down' },
  { key: 'pending', label: 'Stranded in review' },
];

/**
 * §16 — every listing, and the ability to take one down.
 *
 * Approval before publication is gone; sellers publish directly. What an admin
 * still needs is the other direction — a listing that turns out to be fake,
 * duplicated or misleading has to come off the market, and a listing taken down
 * by mistake has to go back on.
 *
 * Enough to judge without opening the listing: the photo, the price, where it
 * is, and how long it has been up. The full page is one click away.
 */
export default async function AdminPropertiesPage({ searchParams }: PageProps) {
  const raw = (await searchParams).status;
  const requested = (Array.isArray(raw) ? raw[0] : raw) ?? 'published';
  const status = (TABS.find((t) => t.key === requested)?.key ?? 'published') as Enums<'property_status'>;

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
          title={
            status === 'published'
              ? 'No live listings yet'
              : status === 'rejected'
                ? 'Nothing has been taken down'
                : 'Nothing stranded'
          }
          description={
            status === 'published'
              ? 'Listings appear here as soon as sellers publish them.'
              : status === 'rejected'
                ? 'Listings you unpublish appear here, and can be restored.'
                : 'Nothing is left over from the old review queue.'
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

                  {/*
                    Both handlers are bound Server Actions. An arrow function
                    here is what crashed this page: only an action reference or
                    the result of `.bind` survives the crossing into a Client
                    Component, and a closure throws "Event handlers cannot be
                    passed to Client Component props" the moment a row renders.
                    `onApprove` used `.bind` and was fine; `onReject` did not.
                  */}
                  <div className="mt-3">
                    {status === 'published' ? (
                      <DecisionButtons
                        onApprove={approveProperty.bind(null, row.id)}
                        onReject={rejectProperty.bind(null, row.id)}
                        approveLabel="Renew for 90 days"
                        rejectLabel="Take down"
                        reasonLabel="Reason the seller will see"
                        reasonPlaceholder="Duplicate of an existing listing, price looks wrong…"
                        approveToast="Renewed"
                        rejectToast="Listing taken down"
                      />
                    ) : (
                      <DecisionButtons
                        onApprove={approveProperty.bind(null, row.id)}
                        onReject={rejectProperty.bind(null, row.id)}
                        approveLabel={status === 'rejected' ? 'Restore and publish' : 'Publish'}
                        rejectLabel="Update reason"
                        approveToast="Listing is live"
                        rejectToast="Reason updated"
                      />
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
