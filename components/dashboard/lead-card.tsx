'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MessageSquare, Phone, StickyNote } from 'lucide-react';
import { cn, propertyPath } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { LeadStatusBadge } from '@/components/ui/badge';
import { formatRelative } from '@/lib/format';
import { LEAD_STATUS_LABELS, LEAD_STATUS_ORDER } from '@/lib/constants';
import { updateLeadStatus, updateLeadNotes } from '@/lib/leads/actions';
import type { LeadRow } from '@/lib/leads/queries';
import type { Enums } from '@/types/database.types';

/**
 * §15 — one enquiry.
 *
 * The buyer's number is the point of the card: the seller earned it when this
 * person spent an unlock, and every second spent hunting for it is friction
 * in the only loop that makes the marketplace work. So it sits at the top as
 * a tappable link, not behind a disclosure.
 *
 * Status is optimistic — it is a private pipeline label, so a wrong one for
 * half a second costs nothing and waiting on a round trip to reorder a list
 * of twenty feels broken. Notes are not: they are typed, and silently losing
 * typed text is unforgivable in a way a reverted chip is not.
 */
export function LeadCard({ lead }: { lead: LeadRow }) {
  const router = useRouter();
  const toast = useToast();

  const [status, setStatus] = React.useState<Enums<'lead_status'>>(lead.status);
  const [notes, setNotes] = React.useState(lead.notes ?? '');
  const [notesOpen, setNotesOpen] = React.useState(Boolean(lead.notes));
  const [savingNotes, setSavingNotes] = React.useState(false);

  // What the server last confirmed, so Save can tell a real edit from a
  // focus-and-leave.
  const savedNotes = React.useRef(lead.notes ?? '');

  async function handleStatus(next: Enums<'lead_status'>) {
    const previous = status;
    setStatus(next);

    const result = await updateLeadStatus(lead.id, next);
    if (!result.ok) {
      setStatus(previous);
      toast({ tone: 'error', title: 'Could not update', description: result.error });
      return;
    }
    // The list may be filtered by status, so the row can belong elsewhere now.
    router.refresh();
  }

  async function handleSaveNotes() {
    if (notes === savedNotes.current) return;
    setSavingNotes(true);

    const result = await updateLeadNotes(lead.id, notes);
    setSavingNotes(false);

    if (!result.ok) {
      toast({ tone: 'error', title: 'Could not save notes', description: result.error });
      return;
    }
    savedNotes.current = notes;
    toast({ tone: 'success', title: 'Notes saved' });
  }

  const where = [lead.property_locality, lead.property_city].filter(Boolean).join(', ');
  const href = lead.property_slug
    ? propertyPath({ id: lead.property_id, slug: lead.property_slug })
    : null;

  return (
    <article className="rounded-card border border-ink-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-ink-900">
            {lead.buyer_name?.trim() || 'Buyer'}
          </h3>
          <p className="mt-0.5 text-sm text-ink-500">
            Asked about{' '}
            {href ? (
              <Link href={href} className="font-medium text-brand-700 hover:underline">
                {lead.property_title}
              </Link>
            ) : (
              <span className="font-medium text-ink-700">{lead.property_title}</span>
            )}
            {where ? <> · {where}</> : null}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <LeadStatusBadge status={status} />
        </div>
      </div>

      {/* The earned contact. */}
      {lead.buyer_mobile ? (
        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          <a
            href={`tel:+91${lead.buyer_mobile}`}
            className="inline-flex items-center gap-2 rounded-field bg-brand-700 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-800"
          >
            <Phone className="size-4" aria-hidden />
            {lead.buyer_mobile}
          </a>
          <a
            href={`https://wa.me/91${lead.buyer_mobile}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-field border border-ink-200 px-3.5 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50"
          >
            <MessageSquare className="size-4" aria-hidden />
            WhatsApp
          </a>
        </div>
      ) : (
        <p className="mt-3.5 text-sm text-ink-500">
          This buyer has not added a mobile number to their profile.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-medium uppercase tracking-wide text-ink-400">Stage</span>
        {LEAD_STATUS_ORDER.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => handleStatus(option)}
            aria-pressed={status === option}
            className={cn(
              'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
              status === option
                ? 'bg-ink-900 text-white'
                : 'bg-ink-100 text-ink-600 hover:bg-ink-200 hover:text-ink-900',
            )}
          >
            {LEAD_STATUS_LABELS[option]}
          </button>
        ))}
      </div>

      <div className="mt-3.5 border-t border-ink-100 pt-3.5">
        {notesOpen ? (
          <div>
            <label htmlFor={`notes-${lead.id}`} className="text-xs font-medium text-ink-500">
              Private note
            </label>
            <textarea
              id={`notes-${lead.id}`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={handleSaveNotes}
              rows={2}
              maxLength={2000}
              placeholder="Asked for a site visit on Saturday…"
              className="mt-1 w-full rounded-field border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
            <div className="mt-1.5 flex items-center justify-between">
              <p className="text-xs text-ink-400">Only you can see this.</p>
              <button
                type="button"
                onClick={handleSaveNotes}
                disabled={savingNotes || notes === savedNotes.current}
                className="text-xs font-semibold text-brand-700 disabled:text-ink-300"
              >
                {savingNotes ? 'Saving…' : notes === savedNotes.current ? 'Saved' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setNotesOpen(true)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-500 hover:text-ink-900"
          >
            <StickyNote className="size-3.5" aria-hidden />
            Add a note
          </button>
        )}
      </div>

      <p className="mt-3 text-xs text-ink-400">
        Enquired {formatRelative(lead.created_at)}
        {lead.unlock_was_free ? ' · free contact' : ` · paid ₹${lead.unlock_amount ?? 9}`}
      </p>
    </article>
  );
}
