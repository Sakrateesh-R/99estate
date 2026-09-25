import { signInWithGoogle } from '@/lib/auth/actions';
import { cn } from '@/lib/utils';

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 shrink-0" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.94-2.91l-3.88-3.01c-1.08.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.29 14.28a7.2 7.2 0 0 1 0-4.56v-3.1H1.28a12 12 0 0 0 0 10.76l4.01-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.95 1.18 15.24 0 12 0A12 12 0 0 0 1.28 6.62l4.01 3.1C6.23 6.88 8.88 4.77 12 4.77Z"
      />
    </svg>
  );
}

/**
 * The only sign-in path in the MVP (§2). A plain form + Server Action, so it
 * works without JavaScript and needs no client bundle.
 */
export function GoogleSignInButton({
  className,
  label = 'Continue with Google',
}: {
  className?: string;
  label?: string;
}) {
  return (
    <form action={signInWithGoogle} className={cn('w-full', className)}>
      <button
        type="submit"
        className="inline-flex h-12 w-full items-center justify-center gap-3 rounded-field border border-ink-300 bg-white px-5 text-[0.9375rem] font-semibold text-ink-900 shadow-sm transition-colors hover:border-ink-400 hover:bg-ink-50"
      >
        <GoogleGlyph />
        {label}
      </button>
    </form>
  );
}
