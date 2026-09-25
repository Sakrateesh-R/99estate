'use client';

import * as React from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronDown, MapPin, Search, SlidersHorizontal } from 'lucide-react';
import { cn, stripEmptyFields } from '@/lib/utils';
import {
  LISTING_TYPE_LABELS,
  PROPERTY_TYPE_LABELS,
  RENT_BUDGETS,
  RESIDENTIAL_TYPES,
  SALE_BUDGETS,
  SEARCH_FORM_PARAMS,
} from '@/lib/constants';

/**
 * Persistent nav search — the same fields as the hero on the home page
 * (looking to / city / property type / budget), compressed into one row.
 *
 * It is the pattern every Indian property portal keeps in the header, because
 * a property session is a sequence of searches rather than one search followed
 * by browsing.
 *
 * A plain GET form pointed at /properties: no JavaScript required, and the
 * result is a shareable, crawlable URL.
 *
 * Two details make it safe to show on the results page itself:
 *
 *   1. Every field defaults to the value already in the URL, so submitting
 *      without touching anything is a no-op rather than a reset.
 *   2. Filters this form does not own — BHK, area, bathrooms, furnishing,
 *      facing, parking, verified, seller type, sort, view — are carried
 *      forward as hidden inputs. Without that, searching from the header
 *      would silently wipe a carefully built filter set.
 */
export function HeaderSearch({ cities }: { cities: { city: string; state: string }[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [expanded, setExpanded] = React.useState(false);

  // Read current values before the early return so hook order stays stable.
  const currentListing = searchParams.get('listing') ?? '';
  const currentCity = searchParams.get('city') ?? '';
  const currentMaxPrice = searchParams.get('max_price') ?? '';

  // The sidebar can select several property types; this select can show only
  // one. `null` means untouched, in which case the full original list is
  // submitted unchanged rather than collapsed to the first entry.
  const originalTypeParam = searchParams.get('type') ?? '';
  const currentType = originalTypeParam.split(',')[0] ?? '';
  const [pickedType, setPickedType] = React.useState<string | null>(null);
  React.useEffect(() => setPickedType(null), [originalTypeParam]);

  const [listing, setListing] = React.useState(currentListing);
  React.useEffect(() => setListing(currentListing), [currentListing]);

  // Everything this form does not control, preserved across the submit.
  const passthrough = React.useMemo(() => {
    const owned = new Set<string>(SEARCH_FORM_PARAMS);
    return [...searchParams.entries()].filter(([key]) => !owned.has(key));
  }, [searchParams]);

  // The hero already carries a larger version of this control.
  if (pathname === '/') return null;

  const budgets = listing === 'rent' || listing === 'pg' ? RENT_BUDGETS : SALE_BUDGETS;

  const summary =
    [
      currentCity,
      currentType ? PROPERTY_TYPE_LABELS[currentType as keyof typeof PROPERTY_TYPE_LABELS] : '',
    ]
      .filter(Boolean)
      .join(' · ') || 'Search properties';

  const selectClass =
    'h-11 w-full cursor-pointer appearance-none bg-white pl-3.5 pr-8 text-sm text-ink-800 outline-none';

  return (
    <div className="container-page pb-3 md:pb-3.5">
      {/* ---- Mobile: a summary pill that opens the full form ---- */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2.5 rounded-full border border-ink-300 bg-white px-4 py-2.5 text-left text-sm shadow-sm md:hidden"
        aria-expanded={expanded}
      >
        <Search className="size-4 shrink-0 text-brand-700" aria-hidden />
        <span className="truncate font-medium text-ink-800">{summary}</span>
        <SlidersHorizontal className="ml-auto size-4 shrink-0 text-ink-400" aria-hidden />
      </button>

      <form
        action="/properties"
        method="GET"
        onSubmit={(e) => stripEmptyFields(e.currentTarget)}
        className={cn(
          'w-full',
          expanded ? 'mt-3 grid gap-2' : 'hidden',
          'md:grid md:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,11rem)_auto] md:gap-0',
          'md:items-stretch md:overflow-hidden md:rounded-full md:border md:border-ink-300 md:bg-white md:shadow-sm',
        )}
      >
        {passthrough.map(([key, value], index) => (
          <input key={`${key}-${index}`} type="hidden" name={key} value={value} />
        ))}

        <Field label="Looking to" className="md:border-r md:border-ink-200">
          <select
            name="listing"
            value={listing}
            onChange={(e) => setListing(e.target.value)}
            aria-label="Looking to"
            className={cn(selectClass, 'rounded-full border border-ink-300 font-semibold md:rounded-none md:border-0 md:pl-5')}
          >
            <option value="">Buy or rent</option>
            {(['sale', 'rent', 'pg'] as const).map((value) => (
              <option key={value} value={value}>
                {LISTING_TYPE_LABELS[value]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="City" className="md:border-r md:border-ink-200">
          <MapPin
            className="pointer-events-none absolute left-3.5 top-1/2 z-10 size-4 -translate-y-1/2 text-ink-400"
            aria-hidden
          />
          <select
            name="city"
            defaultValue={currentCity}
            aria-label="City"
            className={cn(selectClass, 'rounded-full border border-ink-300 pl-10 md:rounded-none md:border-0 md:pl-10')}
          >
            <option value="">All cities</option>
            {cities.map((c) => (
              <option key={`${c.state}-${c.city}`} value={c.city}>
                {c.city}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Property type" className="md:border-r md:border-ink-200">
          {/* The select is unnamed; the hidden input is what submits, so an
              untouched control forwards the full multi-type list intact. */}
          <select
            value={pickedType ?? currentType}
            onChange={(e) => setPickedType(e.target.value)}
            aria-label="Property type"
            className={cn(selectClass, 'rounded-full border border-ink-300 md:rounded-none md:border-0')}
          >
            <option value="">Any property type</option>
            {RESIDENTIAL_TYPES.map((t) => (
              <option key={t} value={t}>
                {PROPERTY_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <input type="hidden" name="type" value={pickedType ?? originalTypeParam} />
        </Field>

        <Field label="Budget" className="md:border-r md:border-ink-200">
          <select
            name="max_price"
            defaultValue={currentMaxPrice}
            aria-label="Budget"
            className={cn(selectClass, 'rounded-full border border-ink-300 md:rounded-none md:border-0')}
          >
            <option value="">Any budget</option>
            {budgets.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
        </Field>

        <button
          type="submit"
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-brand-700 px-6 text-sm font-semibold text-white transition-colors hover:bg-brand-800 md:rounded-none"
        >
          <Search className="size-4" aria-hidden />
          Search
        </button>
      </form>
    </div>
  );
}

/**
 * Positions the custom chevron and the leading icon. Native selects are used
 * on purpose — on mobile the OS picker beats any listbox we could build, and
 * it keeps the whole control usable without JavaScript.
 */
function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('relative min-w-0', className)}>
      <span className="sr-only">{label}</span>
      {children}
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-400"
        aria-hidden
      />
    </div>
  );
}
