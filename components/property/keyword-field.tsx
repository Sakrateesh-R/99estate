'use client';

import * as React from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * §21 — the free-text box every property portal opens with.
 *
 * The search already understood a keyword: `q` is parsed from the URL and runs
 * against a weighted tsvector — title first, then locality, city and state,
 * then the description. The only thing missing was somewhere to type it, so the
 * feature existed and nobody could reach it unless they were already on the
 * results page with the sidebar open.
 *
 * Suggestions come from places that actually have listings, offered through a
 * native `<datalist>`. That is a deliberate choice over a custom autocomplete:
 * it needs no fetch-as-you-type endpoint, no debounce, no keyboard handling and
 * no popup that fights the mobile keyboard — and it still filters as you type.
 * The trade is that it cannot be styled. For a list of place names that is a
 * fair price, and it can be replaced later without touching anything else.
 */
export function KeywordField({
  id,
  defaultValue,
  places,
  placeholder = 'Search locality, landmark or project',
  className,
  inputClassName,
}: {
  id: string;
  defaultValue?: string;
  places: string[];
  placeholder?: string;
  className?: string;
  inputClassName?: string;
}) {
  const listId = `${id}-places`;

  return (
    <div className={cn('relative', className)}>
      <Search
        className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-400"
        aria-hidden
      />
      <input
        id={id}
        // `q` is the parameter the filter layer already reads.
        name="q"
        type="search"
        defaultValue={defaultValue}
        list={places.length > 0 ? listId : undefined}
        placeholder={placeholder}
        aria-label="Search by locality, landmark or keyword"
        autoComplete="off"
        maxLength={120}
        className={cn(
          'h-12 w-full rounded-field border border-ink-300 bg-white pl-10 pr-4 text-[0.9375rem] text-ink-900 outline-none transition-colors placeholder:text-ink-400 hover:border-ink-400 focus:border-brand-600',
          inputClassName,
        )}
      />
      {places.length > 0 ? (
        <datalist id={listId}>
          {places.map((place) => (
            <option key={place} value={place} />
          ))}
        </datalist>
      ) : null}
    </div>
  );
}
