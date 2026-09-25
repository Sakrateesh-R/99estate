'use client';

import * as React from 'react';
import { MapPin, Search } from 'lucide-react';
import { cn, stripEmptyFields } from '@/lib/utils';
import {
  PROPERTY_TYPE_LABELS,
  RENT_BUDGETS,
  RESIDENTIAL_TYPES,
  SALE_BUDGETS,
} from '@/lib/constants';
import type { Enums } from '@/types/database.types';

type Tab = Enums<'listing_type'> | 'commercial' | 'plots';

const TABS: { value: Tab; label: string }[] = [
  { value: 'sale', label: 'Buy' },
  { value: 'rent', label: 'Rent' },
  { value: 'pg', label: 'PG / Co-living' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'plots', label: 'Plots & Land' },
];

const COMMERCIAL_TYPES = ['office_space', 'co_working', 'shop', 'showroom', 'warehouse'] as const;
const PLOT_TYPES = ['residential_plot', 'commercial_plot', 'agricultural_land'] as const;

/**
 * Hero search (§21), built on the tab pattern every Indian property portal
 * uses. The tab is the single biggest branch in intent — a rental search and a
 * plot search share almost no filters — so it comes before everything else.
 *
 * Still a plain GET form pointed at /properties: it works with JavaScript
 * disabled and produces a shareable, crawlable URL. The client component only
 * swaps the type and budget options when the tab changes, because "Up to ₹50 L"
 * is nonsense while searching for a rental.
 */
export function HeroSearch({ cities }: { cities: { city: string; state: string }[] }) {
  const [tab, setTab] = React.useState<Tab>('sale');

  const isRentalMode = tab === 'rent' || tab === 'pg';
  const budgets = isRentalMode ? RENT_BUDGETS : SALE_BUDGETS;

  const typeOptions =
    tab === 'commercial'
      ? COMMERCIAL_TYPES
      : tab === 'plots'
        ? PLOT_TYPES
        : tab === 'pg'
          ? (['pg_hostel'] as const)
          : RESIDENTIAL_TYPES;

  // `commercial` and `plots` are type groupings, not listing types — they map
  // onto the same `sale` listing with a narrower type filter.
  const listingValue = tab === 'commercial' || tab === 'plots' ? 'sale' : tab;

  return (
    <div className="w-full">
      <div
        className="scrollbar-none flex gap-1 overflow-x-auto"
        role="tablist"
        aria-label="What are you looking for"
      >
        {TABS.map((item) => (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={tab === item.value}
            onClick={() => setTab(item.value)}
            className={cn(
              'shrink-0 rounded-t-lg px-4 py-2.5 text-sm font-semibold transition-colors sm:px-5',
              tab === item.value
                ? 'bg-white text-ink-950'
                : 'bg-white/12 text-white/90 hover:bg-white/20',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <form
        action="/properties"
        method="GET"
        onSubmit={(e) => stripEmptyFields(e.currentTarget)}
        className="rounded-card rounded-tl-none bg-white p-3 shadow-pop sm:p-3.5"
      >
        <input type="hidden" name="listing" value={listingValue} />
        {tab === 'commercial' || tab === 'plots' ? (
          <input type="hidden" name="type" value={typeOptions.join(',')} />
        ) : null}

        <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <label className="contents">
            <span className="sr-only">City</span>
            <div className="relative">
              <MapPin
                className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-400"
                aria-hidden
              />
              <select
                name="city"
                defaultValue=""
                aria-label="City"
                className="h-12 w-full cursor-pointer appearance-none rounded-field border border-ink-300 bg-white pl-10 pr-4 text-[0.9375rem] font-medium text-ink-900 outline-none transition-colors hover:border-ink-400 focus:border-brand-600"
              >
                <option value="">All cities</option>
                {cities.map((c) => (
                  <option key={`${c.state}-${c.city}`} value={c.city}>
                    {c.city}, {c.state}
                  </option>
                ))}
              </select>
            </div>
          </label>

          <label className="contents">
            <span className="sr-only">Property type</span>
            <select
              name={tab === 'commercial' || tab === 'plots' ? 'ignored_type' : 'type'}
              defaultValue=""
              aria-label="Property type"
              disabled={tab === 'commercial' || tab === 'plots'}
              className="h-12 w-full cursor-pointer appearance-none rounded-field border border-ink-300 bg-white px-4 text-[0.9375rem] text-ink-900 outline-none transition-colors hover:border-ink-400 focus:border-brand-600 disabled:cursor-not-allowed disabled:bg-ink-100 disabled:text-ink-500"
            >
              <option value="">
                {tab === 'commercial'
                  ? 'All commercial'
                  : tab === 'plots'
                    ? 'All plots & land'
                    : 'Any property type'}
              </option>
              {tab !== 'commercial' && tab !== 'plots'
                ? typeOptions.map((t) => (
                    <option key={t} value={t}>
                      {PROPERTY_TYPE_LABELS[t]}
                    </option>
                  ))
                : null}
            </select>
          </label>

          <label className="contents">
            <span className="sr-only">Budget</span>
            <select
              name="max_price"
              defaultValue=""
              aria-label="Budget"
              className="h-12 w-full cursor-pointer appearance-none rounded-field border border-ink-300 bg-white px-4 text-[0.9375rem] text-ink-900 outline-none transition-colors hover:border-ink-400 focus:border-brand-600"
            >
              <option value="">Any budget</option>
              {budgets.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-field bg-brand-700 px-7 text-[0.9375rem] font-bold text-white transition-colors hover:bg-brand-800"
          >
            <Search className="size-4" aria-hidden />
            Search
          </button>
        </div>
      </form>
    </div>
  );
}
