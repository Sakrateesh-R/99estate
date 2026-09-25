import * as React from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-card border border-ink-200 bg-white shadow-card',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1 p-5 sm:p-6', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-base font-semibold sm:text-lg', className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-ink-500', className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5 pt-0 sm:p-6 sm:pt-0', className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex items-center gap-3 border-t border-ink-100 px-5 py-4 sm:px-6', className)}
      {...props}
    />
  );
}

/** Dashboard KPI tile (§11). */
export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'default',
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: 'default' | 'brand' | 'accent';
}) {
  const toneRing =
    tone === 'brand'
      ? 'bg-brand-50 text-brand-700'
      : tone === 'accent'
        ? 'bg-accent-50 text-accent-700'
        : 'bg-ink-100 text-ink-600';

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.8125rem] font-medium text-ink-500">{label}</p>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight text-ink-950 tabular-nums">
            {value}
          </p>
          {hint ? <p className="mt-1 text-xs text-ink-500">{hint}</p> : null}
        </div>
        {icon ? (
          <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', toneRing)}>
            {icon}
          </span>
        ) : null}
      </div>
    </Card>
  );
}
