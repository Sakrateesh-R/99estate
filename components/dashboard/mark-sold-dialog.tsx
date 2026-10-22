'use client';

import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog } from '@/components/ui/dialog';
import type { SoldVia } from '@/lib/properties/schema';

/**
 * §18 — asks where the buyer came from, at the moment of marking a listing
 * closed.
 *
 * This is the only question on the site whose answer the business cannot get
 * any other way. Views, unlocks and leads all stop short of the thing that
 * matters — whether a deal happened, and whether this site caused it. The
 * seller knows, once, on the day they close, and then forgets.
 *
 * Skipping is a first-class answer, not a dodge. A seller who sold through a
 * broker may not want to say so, and the alternative to an honest "prefer not
 * to say" is either a careless click or a listing left live for months because
 * closing it meant answering a question. A stale listing costs more than a
 * missing data point.
 */

const CHOICES: { value: SoldVia; label: string; hint: string }[] = [
  {
    value: '99estate',
    label: 'Through 99Estate',
    hint: 'The buyer found this listing here',
  },
  {
    value: 'other_platform',
    label: 'Another website',
    hint: 'OLX, 99acres, Facebook or similar',
  },
  {
    value: 'offline',
    label: 'Offline',
    hint: 'A broker, word of mouth, or someone you already knew',
  },
];

export function MarkSoldDialog({
  open,
  onClose,
  onConfirm,
  listingType,
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (soldVia: SoldVia) => void;
  listingType: 'sale' | 'rent' | 'pg';
  busy?: boolean;
}) {
  const [choice, setChoice] = React.useState<SoldVia | null>(null);

  // A reopened dialog should not remember the last listing's answer.
  React.useEffect(() => {
    if (open) setChoice(null);
  }, [open]);

  const closedWord = listingType === 'sale' ? 'sold' : 'rented out';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Mark this listing as ${closedWord}?`}
      description={`It stops showing in search straight away. Before you do — where did you find the ${listingType === 'sale' ? 'buyer' : 'tenant'}? It helps us know whether 99Estate is actually working.`}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-11 rounded-field border border-ink-300 bg-white px-4 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50"
          >
            Cancel
          </button>
          {/* Declining is a button of its own, not a greyed-out default. Hiding
              it would make the question feel compulsory, which is how you get
              answers that are worse than none. */}
          <button
            type="button"
            disabled={busy}
            onClick={() => onConfirm('not_said')}
            className="h-11 rounded-field px-4 text-sm font-medium text-ink-600 underline underline-offset-2 transition-colors hover:text-ink-900 disabled:opacity-50"
          >
            Rather not say
          </button>
          <button
            type="button"
            disabled={busy || choice === null}
            onClick={() => choice && onConfirm(choice)}
            className="h-11 rounded-field bg-brand-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-800 disabled:opacity-50"
          >
            {busy ? 'Saving…' : `Mark as ${closedWord}`}
          </button>
        </div>
      }
    >
      <div className="space-y-2">
        {CHOICES.map(({ value, label, hint }) => {
          const active = choice === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setChoice(value)}
              aria-pressed={active}
              className={cn(
                'flex w-full items-start gap-3 rounded-field border p-3.5 text-left transition-colors',
                active
                  ? 'border-brand-600 bg-brand-50'
                  : 'border-ink-300 bg-white hover:border-ink-400 hover:bg-ink-50',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border',
                  active ? 'border-brand-600 bg-brand-600 text-white' : 'border-ink-300',
                )}
                aria-hidden
              >
                {active ? <Check className="size-3" /> : null}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink-900">{label}</span>
                <span className="block text-xs text-ink-500">{hint}</span>
              </span>
            </button>
          );
        })}
      </div>
    </Dialog>
  );
}
