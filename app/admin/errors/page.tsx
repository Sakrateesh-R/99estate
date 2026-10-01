import type { Metadata } from 'next';
import Link from 'next/link';
import { Bug, CircleAlert } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { getClientErrors, summariseClientErrors, CLIENT_ERROR_KINDS } from '@/lib/admin/errors';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Error log',
  robots: { index: false, follow: false },
};

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * §16 — failures reported from the browser.
 *
 * Server errors already go to the Vercel log; these do not exist anywhere else.
 * The page is deliberately plain: a list, newest first, with whatever context
 * the client could supply. It is a diagnostic surface, not a dashboard — the
 * useful question is "what broke, on whose device, how often", and tables
 * answer that better than charts do.
 */
export default async function AdminErrorsPage({ searchParams }: PageProps) {
  const raw = (await searchParams).kind;
  const requested = Array.isArray(raw) ? raw[0] : raw;
  const kind = CLIENT_ERROR_KINDS.includes(requested as never) ? (requested as string) : null;

  const [errors, summary] = await Promise.all([
    getClientErrors(kind),
    summariseClientErrors(),
  ]);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Error log</h1>
          <p className="mt-1.5 text-[0.9375rem] text-ink-600">
            Failures reported from people&rsquo;s browsers. Kept for 30 days.
          </p>
        </div>
      </div>

      {/* Counts double as the filter: the number is the reason to click. */}
      <div className="mt-6 flex flex-wrap gap-2">
        <FilterChip href="/admin/errors" label="All" count={summary.total} active={kind === null} />
        {CLIENT_ERROR_KINDS.map((k) => (
          <FilterChip
            key={k}
            href={`/admin/errors?kind=${k}`}
            label={KIND_LABELS[k] ?? k}
            count={summary.byKind[k] ?? 0}
            active={kind === k}
          />
        ))}
      </div>

      {errors.length === 0 ? (
        <EmptyState
          className="mt-8"
          icon={<Bug className="size-6" />}
          title={kind ? 'Nothing logged of this kind' : 'Nothing has been reported'}
          description="This is the good outcome. Anything the browser cannot recover from will appear here with whatever detail it could gather."
        />
      ) : (
        <ul className="mt-6 space-y-3">
          {errors.map((error) => (
            <li key={error.id} className="rounded-card border border-ink-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium text-ink-900">
                    <CircleAlert className="size-4 shrink-0 text-amber-600" aria-hidden />
                    <span className="break-words">{error.message}</span>
                  </p>
                  <p className="mt-1 text-xs text-ink-500">
                    {error.reporterName ?? 'Unknown account'}
                    {error.reporterEmail ? ` · ${error.reporterEmail}` : ''} · {formatRelative(error.createdAt)}
                  </p>
                </div>
                <Badge tone="neutral">{KIND_LABELS[error.kind] ?? error.kind}</Badge>
              </div>

              {Object.keys(error.context).length > 0 ? (
                <dl className="mt-3 grid gap-x-6 gap-y-1.5 rounded-field bg-ink-50 p-3 text-xs sm:grid-cols-2">
                  {Object.entries(error.context).map(([key, value]) => (
                    <div key={key} className="flex gap-2">
                      <dt className="shrink-0 font-medium text-ink-500">{key}</dt>
                      <dd className="min-w-0 break-words font-mono text-ink-800">{formatValue(value)}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}

              {error.userAgent ? (
                <p className="mt-2 break-words text-[0.6875rem] leading-relaxed text-ink-400">
                  {error.userAgent}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const KIND_LABELS: Record<string, string> = {
  image_compression: 'Photo compression',
  image_upload: 'Photo upload',
  payment: 'Payment',
  unexpected: 'Unexpected',
};

/** Byte counts are the thing most read here, so they are made legible. */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number' && value > 2048) return `${(value / 1024).toFixed(0)} KB`;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function FilterChip({
  href,
  label,
  count,
  active,
}: {
  href: string;
  label: string;
  count: number;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'border-brand-600 bg-brand-50 text-brand-800'
          : 'border-ink-300 bg-white text-ink-700 hover:border-ink-400',
      )}
    >
      {label}
      <span className={cn('tabular-nums', active ? 'text-brand-700' : 'text-ink-500')}>{count}</span>
    </Link>
  );
}
