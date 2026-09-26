'use client';

import * as React from 'react';
import Link from 'next/link';
import { RefreshCw, TriangleAlert } from 'lucide-react';

/**
 * Shared body for the route `error.tsx` boundaries.
 *
 * Exists because of a real incident: a character counter read `.length` on an
 * absent string, and the whole posting form became
 * "Application error: a client-side exception has occurred" — a message that
 * says nothing to the seller and nothing to us. Diagnosing it meant downloading
 * the production chunk and reading minified JavaScript at a byte offset.
 *
 * So this does the two things that message did not. It gives the person a way
 * onward — `reset()` re-renders the segment, which is enough when the cause was
 * a transient fetch — and it shows Next's error `digest`, which is the key that
 * ties what they saw to the stack trace in the server logs. Without it, a bug
 * report is "it broke".
 *
 * The message itself is deliberately not shown. In production Next replaces it
 * with a generic string anyway, and a raw message is as likely to leak internals
 * as to help.
 */
export function ErrorPanel({
  error,
  reset,
  title = 'Something went wrong',
  description = 'This page failed to load. It is usually temporary.',
  backHref,
  backLabel,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
}) {
  React.useEffect(() => {
    // Goes to the browser console and, in production, to Vercel's client logs —
    // so a support conversation can start from the digest rather than a guess.
    console.error('[99estate] route error', { digest: error.digest, message: error.message });
  }, [error]);

  return (
    <div className="flex min-h-[24rem] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-card border border-ink-200 bg-white p-6 text-center">
        <span className="mx-auto grid size-11 place-items-center rounded-full bg-red-50 text-red-600">
          <TriangleAlert className="size-5" aria-hidden />
        </span>

        <h1 className="mt-4 text-lg font-bold tracking-tight text-ink-950">{title}</h1>
        <p className="mt-1.5 text-sm text-ink-600">{description}</p>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-field bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-800"
          >
            <RefreshCw className="size-4" aria-hidden />
            Try again
          </button>
          {backHref ? (
            <Link
              href={backHref}
              className="rounded-field border border-ink-200 px-4 py-2.5 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50"
            >
              {backLabel ?? 'Go back'}
            </Link>
          ) : null}
        </div>

        {error.digest ? (
          <p className="mt-5 border-t border-ink-100 pt-4 text-xs text-ink-400">
            Quote this if you report it:{' '}
            <code className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-ink-600">
              {error.digest}
            </code>
          </p>
        ) : null}
      </div>
    </div>
  );
}
