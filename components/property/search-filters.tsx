'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { cn, entriesOf } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox, Input, Select } from '@/components/ui/field';
import {
  BEDROOM_OPTIONS,
  FACING_LABELS,
  FURNISHING_LABELS,
  LISTING_TYPE_LABELS,
  POSTED_WITHIN_OPTIONS,
  PROPERTY_TYPE_LABELS,
  SELLER_TYPE_LABELS,
  SORT_OPTIONS,
} from '@/lib/constants';
import { activeFilterCount, type PropertyFilters } from '@/lib/properties/filters';

/**
 * §9 filter experience — the search bar, the sidebar rail, the mobile sheet,
 * and the results column, all in one component.
 *
 * It owns the layout (rather than the page) because the toolbar's "Filters"
 * button and the sheet it opens must share state. The results are passed in
 * as `children`, so they stay a Server Component and never enter the client
 * bundle.
 *
 * The URL is the single source of truth: every control rewrites the query
 * string and lets the server re-render. Results stay shareable, the back
 * button behaves, and no filter state can drift from what is displayed.
 */
export function SearchFilters({
  filters,
  cities,
  children,
}: {
  filters: PropertyFilters;
  cities: { city: string; state: string }[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState(filters.q);
  const activeCount = activeFilterCount(filters);

  // Keep the box in step when navigation changes the URL (back button, chips).
  React.useEffect(() => {
    setQuery(filters.q);
  }, [filters.q]);

  /**
   * Filter changes navigate inside a transition, so the results already on
   * screen stay put while the new ones are fetched instead of the page dropping
   * to its `loading.tsx` skeleton. Rebuilding the whole page for one ticked
   * checkbox loses the reader's place for no gain.
   */
  const [isPending, startTransition] = React.useTransition();

  const commit = React.useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      params.delete('page'); // any filter change resets to page 1
      const qs = params.toString();
      startTransition(() => {
        router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  const setParam = React.useCallback(
    (key: string, value: string | null) => {
      commit((params) => {
        if (value === null || value === '') params.delete(key);
        else params.set(key, value);
      });
    },
    [commit],
  );

  /** Adds or removes one value from a comma-separated multi-select param. */
  const toggleInList = React.useCallback(
    (key: string, value: string) => {
      commit((params) => {
        const current = (params.get(key) ?? '').split(',').filter(Boolean);
        const next = current.includes(value)
          ? current.filter((v) => v !== value)
          : [...current, value];
        if (next.length) params.set(key, next.join(','));
        else params.delete(key);
      });
    },
    [commit],
  );

  // §25 — debounce the text box so typing does not fire a request per keystroke.
  React.useEffect(() => {
    if (query === filters.q) return;
    const timer = window.setTimeout(() => setParam('q', query.trim() || null), 350);
    return () => window.clearTimeout(timer);
  }, [query, filters.q, setParam]);

  const panel = (
    <div className="space-y-6">
      <FilterGroup label="Looking to">
        <ChipRow>
          {entriesOf(LISTING_TYPE_LABELS).map(([value, label]) => (
            <Chip
              key={value}
              active={filters.listing === value}
              onClick={() => setParam('listing', filters.listing === value ? null : value)}
            >
              {label}
            </Chip>
          ))}
        </ChipRow>
      </FilterGroup>

      <FilterGroup label="City">
        <Select value={filters.city} onChange={(e) => setParam('city', e.target.value || null)}>
          <option value="">Any city</option>
          {cities.map((c) => (
            <option key={`${c.state}-${c.city}`} value={c.city}>
              {c.city}
            </option>
          ))}
        </Select>
      </FilterGroup>

      <FilterGroup label="Locality">
        <LocalityInput value={filters.locality} onCommit={(v) => setParam('locality', v || null)} />
      </FilterGroup>

      <FilterGroup label="Budget (₹)">
        <div className="grid grid-cols-2 gap-2">
          <NumberInput
            aria-label="Minimum price"
            placeholder="Min"
            value={filters.minPrice}
            onCommit={(v) => setParam('min_price', v)}
          />
          <NumberInput
            aria-label="Maximum price"
            placeholder="Max"
            value={filters.maxPrice}
            onCommit={(v) => setParam('max_price', v)}
          />
        </div>
      </FilterGroup>

      <FilterGroup label="Bedrooms">
        <ChipRow>
          {BEDROOM_OPTIONS.map((n) => (
            <Chip
              key={n}
              active={filters.bhk.includes(n)}
              onClick={() => toggleInList('bhk', String(n))}
            >
              {n === 5 ? '5+ BHK' : `${n} BHK`}
            </Chip>
          ))}
        </ChipRow>
      </FilterGroup>

      <FilterGroup label="Property type">
        <ChipRow>
          {entriesOf(PROPERTY_TYPE_LABELS).map(([value, label]) => (
            <Chip
              key={value}
              active={filters.types.includes(value)}
              onClick={() => toggleInList('type', value)}
            >
              {label}
            </Chip>
          ))}
        </ChipRow>
      </FilterGroup>

      <FilterGroup label="Area (sq.ft)">
        <div className="grid grid-cols-2 gap-2">
          <NumberInput
            aria-label="Minimum area"
            placeholder="Min"
            value={filters.minArea}
            onCommit={(v) => setParam('min_area', v)}
          />
          <NumberInput
            aria-label="Maximum area"
            placeholder="Max"
            value={filters.maxArea}
            onCommit={(v) => setParam('max_area', v)}
          />
        </div>
      </FilterGroup>

      <FilterGroup label="Bathrooms">
        <ChipRow>
          {[1, 2, 3, 4].map((n) => (
            <Chip
              key={n}
              active={filters.minBathrooms === n}
              onClick={() => setParam('bath', filters.minBathrooms === n ? null : String(n))}
            >
              {n}+
            </Chip>
          ))}
        </ChipRow>
      </FilterGroup>

      <FilterGroup label="Furnishing">
        <ChipRow>
          {entriesOf(FURNISHING_LABELS).map(([value, label]) => (
            <Chip
              key={value}
              active={filters.furnishing.includes(value)}
              onClick={() => toggleInList('furnishing', value)}
            >
              {label}
            </Chip>
          ))}
        </ChipRow>
      </FilterGroup>

      <FilterGroup label="Facing">
        <ChipRow>
          {entriesOf(FACING_LABELS).map(([value, label]) => (
            <Chip
              key={value}
              active={filters.facing.includes(value)}
              onClick={() => toggleInList('facing', value)}
            >
              {label}
            </Chip>
          ))}
        </ChipRow>
      </FilterGroup>

      <FilterGroup label="Posted by">
        <ChipRow>
          {(['owner', 'agent', 'builder'] as const).map((value) => (
            <Chip
              key={value}
              active={filters.sellerTypes.includes(value)}
              onClick={() => toggleInList('seller', value)}
            >
              {SELLER_TYPE_LABELS[value]}
            </Chip>
          ))}
        </ChipRow>
      </FilterGroup>

      <FilterGroup label="Posted within">
        <Select
          value={filters.postedWithinDays ? String(filters.postedWithinDays) : ''}
          onChange={(e) => setParam('posted', e.target.value || null)}
        >
          <option value="">Any time</option>
          {POSTED_WITHIN_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </FilterGroup>

      <div className="space-y-3 border-t border-ink-200 pt-5">
        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink-700">
          <Checkbox
            checked={filters.verifiedOnly}
            onChange={(e) => setParam('verified', e.target.checked ? '1' : null)}
          />
          Verified listings only
        </label>
        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink-700">
          <Checkbox
            checked={filters.parking}
            onChange={(e) => setParam('parking', e.target.checked ? '1' : null)}
          />
          Has parking
        </label>
      </div>

      {activeCount > 0 ? (
        <Button variant="outline" fullWidth onClick={() => router.push(pathname, { scroll: false })}>
          Clear all filters
        </Button>
      ) : null}
    </div>
  );

  return (
    <div>
      {/* ---- Search + sort, full width above the results ---- */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-56 flex-1">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-400"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, locality or city…"
            aria-label="Search properties"
            className="pl-10"
          />
        </div>

        <Select
          value={filters.sort}
          onChange={(e) => setParam('sort', e.target.value === 'relevance' ? null : e.target.value)}
          aria-label="Sort results"
          className="w-44"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>

        <Button variant="outline" onClick={() => setOpen(true)} className="lg:hidden">
          <SlidersHorizontal className="size-4" aria-hidden />
          Filters
          {activeCount > 0 ? (
            <span className="ml-1 grid size-5 place-items-center rounded-full bg-brand-700 text-[0.6875rem] font-bold text-white">
              {activeCount}
            </span>
          ) : null}
        </Button>
      </div>

      {/* ---- Rail + results ---- */}
      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start">
        <aside className="hidden lg:block">
          <div className="sticky top-44 max-h-[calc(100dvh-13rem)] overflow-y-auto rounded-card border border-ink-200 bg-white p-4">
            <h2 className="mb-4 text-sm font-semibold text-ink-900">Filters</h2>
            {panel}
          </div>
        </aside>

        {/*
          The results pass through here, so this is the one place that can show
          them going stale: they fade and stop taking clicks while the new set
          loads, rather than sitting there looking current or vanishing into a
          skeleton. `aria-busy` says the same thing to a screen reader.
        */}
        <div
          className={cn(
            'min-w-0 transition-opacity duration-200',
            isPending && 'pointer-events-none opacity-60',
          )}
          aria-busy={isPending}
        >
          {children}
        </div>
      </div>

      {/* ---- Mobile sheet ---- */}
      {open ? (
        <div className="fixed inset-0 z-[70] lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-ink-950/50"
            onClick={() => setOpen(false)}
            aria-label="Close filters"
            tabIndex={-1}
          />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-card bg-white">
            <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
              <h2 className="text-base font-semibold">Filters</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="-m-1.5 rounded p-1.5 text-ink-500 hover:bg-ink-100"
                aria-label="Close filters"
                autoFocus
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">{panel}</div>

            <div className="border-t border-ink-100 p-4">
              <Button fullWidth size="lg" onClick={() => setOpen(false)}>
                Show results
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-ink-500">{label}</h3>
      {children}
    </div>
  );
}

/**
 * Chips size to their content and wrap.
 *
 * A fixed-column grid squeezes a long label like "PG / Co-living" into a
 * three-line pill that renders as a circle in a narrow rail — which is exactly
 * what happened before.
 */
function ChipRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-1.5">{children}</div>;
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'whitespace-nowrap rounded-full border px-2.5 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'border-brand-600 bg-brand-50 text-brand-800'
          : 'border-ink-300 bg-white text-ink-700 hover:border-ink-400',
      )}
    >
      {children}
    </button>
  );
}

/** Commits on blur or Enter rather than per keystroke. */
function NumberInput({
  value,
  onCommit,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: number | null;
  onCommit: (value: string | null) => void;
}) {
  const [local, setLocal] = React.useState(value === null ? '' : String(value));

  React.useEffect(() => {
    setLocal(value === null ? '' : String(value));
  }, [value]);

  return (
    <Input
      {...props}
      inputMode="numeric"
      value={local}
      onChange={(e) => setLocal(e.target.value.replace(/[^\d]/g, ''))}
      onBlur={() => onCommit(local || null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onCommit(local || null);
        }
      }}
    />
  );
}

function LocalityInput({ value, onCommit }: { value: string; onCommit: (value: string) => void }) {
  const [local, setLocal] = React.useState(value);

  React.useEffect(() => {
    setLocal(value);
  }, [value]);

  React.useEffect(() => {
    if (local === value) return;
    const timer = window.setTimeout(() => onCommit(local.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [local, value, onCommit]);

  return (
    <Input
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      placeholder="e.g. Saravanampatti"
      aria-label="Locality"
    />
  );
}
