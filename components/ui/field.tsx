import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const CONTROL =
  'w-full rounded-field border border-ink-300 bg-white text-ink-900 placeholder:text-ink-400 ' +
  'transition-colors hover:border-ink-400 focus:border-brand-600 ' +
  'disabled:cursor-not-allowed disabled:bg-ink-100 disabled:text-ink-500 ' +
  'aria-[invalid=true]:border-red-500';

export function Label({
  className,
  required,
  children,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  return (
    <label className={cn('text-sm font-medium text-ink-800', className)} {...props}>
      {children}
      {required ? (
        <span className="ml-0.5 text-red-600" aria-hidden>
          *
        </span>
      ) : null}
    </label>
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL, 'h-11 px-3.5 text-[0.9375rem]', className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(CONTROL, 'min-h-28 resize-y px-3.5 py-2.5 text-[0.9375rem] leading-relaxed', className)}
      {...props}
    />
  );
}

/**
 * Native select with a custom chevron. Native beats a JS listbox on mobile —
 * the OS picker is faster and more accessible than anything we would build.
 */
export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        className={cn(CONTROL, 'h-11 appearance-none pl-3.5 pr-10 text-[0.9375rem]', className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-500"
        aria-hidden
      />
    </div>
  );
}

/** Currency-prefixed number input used for prices. */
export function PriceInput({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[0.9375rem] font-medium text-ink-500">
        ₹
      </span>
      <Input inputMode="numeric" className={cn('pl-8', className)} {...props} />
    </div>
  );
}

export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-sm font-medium text-red-600">
      {children}
    </p>
  );
}

export function FieldHint({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return <p className="text-xs text-ink-500">{children}</p>;
}

/** Label + control + hint/error, wired together with the right aria plumbing. */
export function Field({
  label,
  htmlFor,
  required,
  error,
  hint,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  error?: string | null;
  hint?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={htmlFor} required={required}>
        {label}
      </Label>
      {children}
      {error ? <FieldError>{error}</FieldError> : <FieldHint>{hint}</FieldHint>}
    </div>
  );
}

export function Checkbox({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="checkbox"
      className={cn(
        'size-4 shrink-0 rounded border-ink-300 text-brand-700 accent-brand-700 transition-colors',
        className,
      )}
      {...props}
    />
  );
}
