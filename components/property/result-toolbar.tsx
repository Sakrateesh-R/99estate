'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { LayoutGrid, Rows3, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/spinner';
import {
  FACING_LABELS,
  FURNISHING_LABELS,
  LISTING_TYPE_LABELS,
  PROPERTY_TYPE_LABELS,
  SELLER_TYPE_LABELS,
} from '@/lib/constants';
import { formatPriceShort } from '@/lib/format';
import type { PropertyFilters } from '@/lib/properties/filters';

type Chip = { label: string; clear: (params: URLSearchParams) => void };

/**
 * Result count, active-filter chips and the list/grid switch.
 *
 * The chips matter more than they look: with a dozen filters available it is
 * easy to forget that "verified only" is still on and conclude the market is
 * empty. Every active filter is visible here and removable in one tap.
 */
export function ResultToolbar({
  filters,
  total,
  from,
  to,
}: {
  filters: PropertyFilters;
  total: number;
  from: number;
  to: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  /**
   * Refinements navigate inside a transition.
   *
   * Two reasons. It gives `isPending`, so the toolbar can say the results are
   * being fetched instead of leaving stale numbers sitting there looking
   * current. And a transition keeps the existing results on screen rather than
   * dropping to the route's `loading.tsx` skeleton — dropping a whole page of
   * results to rebuild it for one removed filter chip is a worse answer than
   * showing the old ones for a moment while they update.
   */
  const [isPending, startTransition] = React.useTransition();

  function commit(mutate: (params: URLSearchParams) => void, resetPage = true) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    if (resetPage) params.delete('page');
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  const drop = (key: string) => (params: URLSearchParams) => params.delete(key);
  const dropFrom = (key: string, value: string) => (params: URLSearchParams) => {
    const rest = (params.get(key) ?? '').split(',').filter((v) => v && v !== value);
    if (rest.length) params.set(key, rest.join(','));
    else params.delete(key);
  };

  const chips: Chip[] = [];

  if (filters.q) chips.push({ label: `"${filters.q}"`, clear: drop('q') });
  if (filters.city) chips.push({ label: filters.city, clear: drop('city') });
  if (filters.locality) chips.push({ label: filters.locality, clear: drop('locality') });
  if (filters.listing) {
    chips.push({ label: LISTING_TYPE_LABELS[filters.listing], clear: drop('listing') });
  }
  for (const type of filters.types) {
    chips.push({ label: PROPERTY_TYPE_LABELS[type], clear: dropFrom('type', type) });
  }
  for (const bhk of filters.bhk) {
    chips.push({ label: bhk === 5 ? '5+ BHK' : `${bhk} BHK`, clear: dropFrom('bhk', String(bhk)) });
  }
  if (filters.minPrice !== null || filters.maxPrice !== null) {
    const lo = filters.minPrice !== null ? formatPriceShort(filters.minPrice) : 'Any';
    const hi = filters.maxPrice !== null ? formatPriceShort(filters.maxPrice) : 'Any';
    chips.push({
      label: `${lo} – ${hi}`,
      clear: (p) => {
        p.delete('min_price');
        p.delete('max_price');
      },
    });
  }
  if (filters.minArea !== null || filters.maxArea !== null) {
    chips.push({
      label: `${filters.minArea ?? 'Any'} – ${filters.maxArea ?? 'Any'} sq.ft`,
      clear: (p) => {
        p.delete('min_area');
        p.delete('max_area');
      },
    });
  }
  if (filters.minBathrooms !== null) {
    chips.push({ label: `${filters.minBathrooms}+ bath`, clear: drop('bath') });
  }
  for (const f of filters.furnishing) {
    chips.push({ label: FURNISHING_LABELS[f], clear: dropFrom('furnishing', f) });
  }
  for (const f of filters.facing) {
    chips.push({ label: `${FACING_LABELS[f]} facing`, clear: dropFrom('facing', f) });
  }
  for (const s of filters.sellerTypes) {
    chips.push({ label: `By ${SELLER_TYPE_LABELS[s].toLowerCase()}`, clear: dropFrom('seller', s) });
  }
  if (filters.parking) chips.push({ label: 'Has parking', clear: drop('parking') });
  if (filters.verifiedOnly) chips.push({ label: 'Verified only', clear: drop('verified') });
  if (filters.postedWithinDays !== null) {
    chips.push({ label: `Last ${filters.postedWithinDays} days`, clear: drop('posted') });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/*
          The count is where a change is confirmed or not, so it is also where
          "not yet" belongs — announced politely so a screen reader hears the
          result arrive rather than being interrupted mid-sentence.
        */}
        <p className="flex items-center gap-2 text-sm text-ink-600" aria-live="polite" aria-busy={isPending}>
          {isPending ? (
            <>
              <Spinner className="size-3.5 text-brand-600" />
              <span>Updating results…</span>
            </>
          ) : total === 0 ? (
            'No properties found'
          ) : (
            <>
              <strong className="font-semibold text-ink-900">
                {from}–{to}
              </strong>{' '}
              of{' '}
              <strong className="font-semibold text-ink-900">
                {new Intl.NumberFormat('en-IN').format(total)}
              </strong>{' '}
              {total === 1 ? 'property' : 'properties'}
            </>
          )}
        </p>

        <div
          className="inline-flex shrink-0 overflow-hidden rounded-field border border-ink-300 bg-white"
          role="group"
          aria-label="Result layout"
        >
          {(
            [
              { value: 'list', label: 'List', Icon: Rows3 },
              { value: 'grid', label: 'Grid', Icon: LayoutGrid },
            ] as const
          ).map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => commit((p) => (value === 'grid' ? p.set('view', 'grid') : p.delete('view')), false)}
              aria-pressed={filters.view === value}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition-colors',
                filters.view === value
                  ? 'bg-ink-950 text-white'
                  : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
              )}
            >
              <Icon className="size-3.5" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </div>

      {chips.length > 0 ? (
        <div className="scrollbar-none mt-3 flex items-center gap-2 overflow-x-auto pb-0.5">
          {chips.map((chip, index) => (
            <button
              key={`${chip.label}-${index}`}
              type="button"
              onClick={() => commit(chip.clear)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-ink-300 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700"
            >
              {chip.label}
              <X className="size-3" aria-hidden />
            </button>
          ))}

          <button
            type="button"
            onClick={() => router.push(pathname, { scroll: false })}
            className="shrink-0 px-2 py-1.5 text-xs font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-900"
          >
            Clear all
          </button>
        </div>
      ) : null}
    </div>
  );
}
