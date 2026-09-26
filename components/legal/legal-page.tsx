import * as React from 'react';
import { LEGAL } from '@/lib/legal';

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
  return (
    <div className="container-page py-10 lg:py-14">
      <div className="max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-ink-500">
          Last updated {LEGAL.lastUpdated} · {LEGAL.entityName}
        </p>

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
export function Callout({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  /**
   * `warning` is for text about the document rather than in it — a notice that
   * a clause is not yet in force, say. It has to look unlike the surrounding
   * legal prose, or it reads as just another paragraph of it.
   */
  tone?: 'neutral' | 'warning';
}) {
  return (
    <div
      className={
        tone === 'warning'
          ? 'rounded-field border border-amber-300 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900'
          : 'rounded-field border border-ink-200 bg-ink-50 p-4 text-sm leading-relaxed text-ink-700'
      }
    >
      {children}
    </div>
  );
}
