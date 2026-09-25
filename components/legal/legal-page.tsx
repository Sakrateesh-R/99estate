import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import { legalReviewState, LEGAL } from '@/lib/legal';

/**
 * Shared shell for /terms and /privacy.
 *
 * No typography plugin is installed, so the prose rhythm is set here once
 * rather than re-declared on every paragraph in both documents.
 */
export function LegalPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: React.ReactNode;
  children: React.ReactNode;
}) {
  const review = legalReviewState();

  return (
    <div className="container-page py-10 lg:py-14">
      <div className="max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-ink-500">
          Last updated {LEGAL.lastUpdated} · {LEGAL.entityName}
        </p>

        {review !== 'approved' ? (
          <div className="mt-6 flex gap-3 rounded-card border border-amber-300 bg-amber-50 p-4">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden />
            <div className="text-sm leading-relaxed text-amber-900">
              {review === 'placeholders' ? (
                <>
                  <p className="font-semibold">This document is a draft and is not yet in force.</p>
                  <p className="mt-1">
                    It still contains unfilled placeholders. Complete the details in{' '}
                    <code className="font-mono text-xs">lib/legal.ts</code> and have both documents
                    reviewed before relying on them.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-semibold">Pending legal review.</p>
                  <p className="mt-1">
                    This document describes our planned data practices and has not yet been reviewed
                    by a qualified Indian privacy or legal professional. Set{' '}
                    <code className="font-mono text-xs">REVIEWED_BY_COUNSEL</code> in{' '}
                    <code className="font-mono text-xs">lib/legal.ts</code> once it has been approved.
                  </p>
                </>
              )}
            </div>
          </div>
        ) : null}

        <div className="mt-6 text-[1.0625rem] leading-relaxed text-ink-700">{intro}</div>

        <div className="mt-10 space-y-9">{children}</div>
      </div>
    </div>
  );
}

export function Section({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return (
    <section id={id} className="scroll-mt-40">
      <h2 className="text-xl font-bold tracking-tight text-ink-950">
        <span className="mr-2 text-ink-400">{n}.</span>
        {title}
      </h2>
      <div className="mt-3 space-y-3 text-[0.9375rem] leading-relaxed text-ink-700">{children}</div>
    </section>
  );
}

export function List({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-2 pl-1">
      {items.map((item, index) => (
        <li key={index} className="flex gap-2.5">
          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Pulls a definition out of the body text where it carries legal weight. */
export function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-field border border-ink-200 bg-ink-50 p-4 text-sm leading-relaxed text-ink-700">
      {children}
    </div>
  );
}
