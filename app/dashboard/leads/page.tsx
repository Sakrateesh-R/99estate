import type { Metadata } from 'next';
import Link from 'next/link';
import { Inbox } from 'lucide-react';
import { LeadCard } from '@/components/dashboard/lead-card';
import { EmptyState } from '@/components/ui/empty-state';
import { ButtonLink } from '@/components/ui/button';
import { requireProfile } from '@/lib/auth/session';
import { getLeads, getLeadSummary } from '@/lib/leads/queries';
import { cn } from '@/lib/utils';
import { LEAD_STATUS_LABELS, LEAD_STATUS_ORDER } from '@/lib/constants';
import type { Enums } from '@/types/database.types';

export const metadata: Metadata = {
  title: 'Enquiries',
  robots: { index: false, follow: false },
};

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const STATUSES = new Set<string>(LEAD_STATUS_ORDER);

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

/**
 * §15 — the seller's inbox.
 *
 * Every unlock already wrote a lead; until now nothing showed them one. A
 * seller's only signal that the marketplace was working was their phone
 * ringing, which is a poor reason to come back and post again.
 *
 * Filters stay in the query string here, unlike the public pages. These are
 * noindex screens behind a login, so there is no crawl space to protect and
 * no canonical to split — and a shareable filtered view is genuinely useful
 * when the seller is comparing two listings.
 */
export default async function LeadsPage({ searchParams }: PageProps) {
  await requireProfile();

  const params = await searchParams;
  const rawStatus = first(params.status);
  const status = STATUSES.has(rawStatus) ? (rawStatus as Enums<'lead_status'>) : null;
  const propertyId = first(params.property) || null;

  const [summary, leads] = await Promise.all([
    getLeadSummary(),
    getLeads({ status, propertyId }),
  ]);

  const hasAny = summary.total > 0;

  function filterHref(next: { status?: string | null; property?: string | null }) {
    const p = new URLSearchParams();
    const s = next.status === undefined ? status : next.status;
    const pr = next.property === undefined ? propertyId : next.property;
    if (s) p.set('status', s);
    if (pr) p.set('property', pr);
    const qs = p.toString();
    return qs ? `/dashboard/leads?${qs}` : '/dashboard/leads';
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Enquiries</h1>
          <p className="mt-1.5 text-[0.9375rem] text-ink-600">
            {hasAny ? (
              <>
                <strong className="font-semibold text-ink-900">{summary.total}</strong>{' '}
                {summary.total === 1 ? 'buyer has' : 'buyers have'} unlocked your contact
                {summary.thisWeek > 0 ? <> · {summary.thisWeek} this week</> : null}
                {summary.unactioned > 0 ? (
                  <>
                    {' '}
                    ·{' '}
                    <strong className="font-semibold text-brand-700">
                      {summary.unactioned} new
                    </strong>
                  </>
                ) : null}
              </>
            ) : (
              'When a buyer unlocks your contact, they appear here with their phone number.'
            )}
          </p>
        </div>
      </div>

      {hasAny ? (
        <div className="mt-6 space-y-3">
          {/* Status */}
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterChip href={filterHref({ status: null })} active={status === null}>
              All ({summary.total})
            </FilterChip>
            {LEAD_STATUS_ORDER.filter((s) => (summary.byStatus[s] ?? 0) > 0).map((s) => (
              <FilterChip key={s} href={filterHref({ status: s })} active={status === s}>
                {LEAD_STATUS_LABELS[s]} ({summary.byStatus[s]})
              </FilterChip>
            ))}
          </div>

          {/* Listing — only worth showing once more than one has produced enquiries. */}
          {summary.properties.length > 1 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <FilterChip href={filterHref({ property: null })} active={propertyId === null}>
                All listings
              </FilterChip>
              {summary.properties.map((p) => (
                <FilterChip
                  key={p.id}
                  href={filterHref({ property: p.id })}
                  active={propertyId === p.id}
                >
                  <span className="max-w-[16rem] truncate">{p.title}</span> ({p.count})
                </FilterChip>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {leads.length === 0 ? (
        <EmptyState
          className="mt-8"
          icon={<Inbox className="size-6" />}
          title={hasAny ? 'Nothing matches this filter' : 'No enquiries yet'}
          description={
            hasAny ? (
              'Try clearing the filter to see every enquiry.'
            ) : (
              <>
                Enquiries arrive when a buyer unlocks your contact on one of your listings. The
                more listings you have live, the more you will get.
              </>
            )
          }
          action={
            hasAny ? (
              <ButtonLink href="/dashboard/leads" variant="outline">
                Clear filters
              </ButtonLink>
            ) : (
              <>
                <ButtonLink href="/dashboard/properties">My properties</ButtonLink>
                <ButtonLink href="/dashboard/properties/new" variant="outline">
                  Post a property
                </ButtonLink>
              </>
            )
          }
        />
      ) : (
        <div className="mt-5 space-y-3">
          {leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'bg-ink-900 text-white'
          : 'bg-ink-100 text-ink-600 hover:bg-ink-200 hover:text-ink-900',
      )}
    >
      {children}
    </Link>
  );
}
