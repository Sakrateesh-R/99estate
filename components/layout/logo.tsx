import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * 99Estate mark: a roofline over a key-slot aperture. Reads as "property" at
 * 24px and still holds together as a favicon.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-8', className)} role="img" aria-label="99Estate">
      <rect width="32" height="32" rx="9" className="fill-brand-700" />
      <path
        d="M16 7.4 25.2 15a.9.9 0 0 1-.57 1.6H23.1v6.9a1.5 1.5 0 0 1-1.5 1.5h-11.2a1.5 1.5 0 0 1-1.5-1.5v-6.9H7.37A.9.9 0 0 1 6.8 15Z"
        className="fill-brand-300"
      />
      <circle cx="16" cy="17.6" r="2.3" className="fill-brand-900" />
      <path d="M14.85 19.2h2.3l-.5 4.1h-1.3Z" className="fill-brand-900" />
    </svg>
  );
}

export function Logo({
  className,
  href = '/',
  showWordmark = true,
}: {
  className?: string;
  href?: string;
  showWordmark?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn('inline-flex items-center gap-2.5 font-display', className)}
      aria-label="99Estate home"
    >
      <LogoMark />
      {showWordmark ? (
        <span className="text-[1.3125rem] font-bold leading-none tracking-tight">
          <span className="text-brand-700">99</span>
          <span className="text-ink-950">Estate</span>
        </span>
      ) : null}
    </Link>
  );
}
