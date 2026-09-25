import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Shared empty / error surface (§20). Always offers a way forward — a dead end
 * on a marketplace is a lost session.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  tone = 'default',
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  tone?: 'default' | 'error';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-card border border-dashed px-6 py-14 text-center',
        tone === 'error' ? 'border-red-200 bg-red-50/40' : 'border-ink-300 bg-white',
        className,
      )}
    >
      {icon ? (
        <span
          className={cn(
            'mb-4 grid size-14 place-items-center rounded-2xl',
            tone === 'error' ? 'bg-red-100 text-red-600' : 'bg-ink-100 text-ink-500',
          )}
        >
          {icon}
        </span>
      ) : null}
      <h3 className="text-base font-semibold text-ink-900">{title}</h3>
      {description ? (
        <div className="mt-1.5 max-w-md text-sm text-ink-500">{description}</div>
      ) : null}
      {action ? <div className="mt-6 flex flex-wrap justify-center gap-3">{action}</div> : null}
    </div>
  );
}
