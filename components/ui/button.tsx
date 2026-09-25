import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/spinner';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'unlock';
type Size = 'sm' | 'md' | 'lg';

const BASE =
  'inline-flex items-center justify-center gap-2 font-semibold whitespace-nowrap rounded-field ' +
  'transition-[background-color,box-shadow,transform,color] duration-150 ' +
  'disabled:pointer-events-none disabled:opacity-55 active:translate-y-px select-none';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white shadow-sm hover:bg-brand-800',
  secondary: 'bg-ink-950 text-white shadow-sm hover:bg-ink-800',
  outline: 'border border-ink-300 bg-white text-ink-800 hover:border-ink-400 hover:bg-ink-50',
  ghost: 'text-ink-700 hover:bg-ink-100 hover:text-ink-900',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700',
  /**
   * Reserved for the one CTA that matters most (§20). Gold, not green, so it
   * reads as "the offer" and never blends into the surrounding chrome.
   */
  unlock:
    'bg-accent-500 text-ink-950 shadow-[0_6px_20px_-6px_rgb(249_142_7/0.7)] hover:bg-accent-400 ' +
    'ring-1 ring-inset ring-accent-600/25',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-4 text-[0.9375rem]',
  lg: 'h-12 px-6 text-base',
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
};

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner className="size-4" /> : null}
      {children}
    </button>
  );
}

export type ButtonLinkProps = React.ComponentPropsWithoutRef<typeof Link> & {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
};

/** Same visual language as Button, but renders a real anchor. */
export function ButtonLink({
  className,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      className={cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className)}
      {...props}
    />
  );
}
