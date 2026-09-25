import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Server-rendered pagination. Plain links, so pages are crawlable and the
 * browser handles prefetch and history — §25 forbids pulling the whole result
 * set into the client, and this is the other half of that.
 */
export function Pagination({
  page,
  pageCount,
  buildHref,
  className,
}: {
  page: number;
  pageCount: number;
  buildHref: (page: number) => string;
  className?: string;
}) {
  if (pageCount <= 1) return null;

  const pages = pageWindow(page, pageCount);

  return (
    <nav className={cn('flex items-center justify-center gap-1.5', className)} aria-label="Pagination">
      <PageLink href={buildHref(page - 1)} disabled={page <= 1} aria-label="Previous page">
        <ChevronLeft className="size-4" aria-hidden />
      </PageLink>

      {pages.map((entry, index) =>
        entry === 'gap' ? (
          <span key={`gap-${index}`} className="px-1.5 text-ink-400" aria-hidden>
            …
          </span>
        ) : (
          <PageLink key={entry} href={buildHref(entry)} current={entry === page}>
            {entry}
          </PageLink>
        ),
      )}

      <PageLink href={buildHref(page + 1)} disabled={page >= pageCount} aria-label="Next page">
        <ChevronRight className="size-4" aria-hidden />
      </PageLink>
    </nav>
  );
}

function PageLink({
  href,
  children,
  current,
  disabled,
  ...props
}: {
  href: string;
  children: React.ReactNode;
  current?: boolean;
  disabled?: boolean;
} & React.AriaAttributes) {
  const className = cn(
    'inline-flex h-10 min-w-10 items-center justify-center rounded-lg px-3 text-sm font-medium transition-colors',
    current
      ? 'bg-brand-700 text-white'
      : 'border border-ink-300 bg-white text-ink-700 hover:border-ink-400 hover:bg-ink-50',
    disabled && 'pointer-events-none opacity-40',
  );

  if (disabled) {
    return (
      <span className={className} aria-disabled {...props}>
        {children}
      </span>
    );
  }

  return (
    <Link href={href} className={className} aria-current={current ? 'page' : undefined} {...props}>
      {children}
    </Link>
  );
}

/** First, last, and a window around the current page, with … for the gaps. */
function pageWindow(page: number, pageCount: number): (number | 'gap')[] {
  const span = 1;
  const out: (number | 'gap')[] = [];
  let last = 0;

  for (let i = 1; i <= pageCount; i++) {
    const keep = i === 1 || i === pageCount || (i >= page - span && i <= page + span);
    if (!keep) continue;
    if (last && i - last > 1) out.push('gap');
    out.push(i);
    last = i;
  }

  return out;
}
