import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Conditional class names with Tailwind conflict resolution. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Builds the canonical SEO path for a listing:
 *   /property/2bhk-apartment-for-sale-saravanampatti-coimbatore-<uuid>
 *
 * The uuid suffix is what actually resolves the page, so the slug can change
 * freely (and old links keep working) without a redirect table.
 */
export function propertyPath(property: { id: string; slug?: string | null }) {
  return property.slug ? `/property/${property.slug}-${property.id}` : `/property/${property.id}`;
}

const UUID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** Extracts the listing id from a slugged property path segment. */
export function propertyIdFromSlug(slugWithId: string): string | null {
  const match = UUID_RE.exec(slugWithId);
  return match ? match[1]!.toLowerCase() : null;
}

/**
 * Guards the post-sign-in redirect target.
 *
 * Must be a path on this origin. `//evil.com` is a protocol-relative URL that
 * browsers treat as absolute, so rejecting it is what stops this from becoming
 * an open redirect. Backslashes are rejected because some browsers normalise
 * `/\evil.com` the same way.
 *
 * Lives here rather than beside the cookie helpers because middleware needs it
 * too, and middleware cannot import `next/headers`.
 */
export function isSafeReturnPath(path: string | null | undefined): path is string {
  return (
    typeof path === 'string' &&
    path.startsWith('/') &&
    !path.startsWith('//') &&
    !path.includes('\\') &&
    path.length <= 512
  );
}

/**
 * Submit handler for the GET search forms.
 *
 * A native GET form serialises every named control, so untouched "Any budget"
 * selects would land in the URL as `listing=&type=&max_price=`. Blanking the
 * name just before submit keeps those out of the address bar — the browser
 * serialises after this handler runs, and the page navigates away immediately,
 * so the mutation is never visible.
 */
export function stripEmptyFields(form: HTMLFormElement): void {
  for (const element of Array.from(form.elements)) {
    const field = element as HTMLInputElement | HTMLSelectElement;
    if (field.name && field.value === '') field.name = '';
  }
}

/** Typed `Object.entries` for enum→label maps. */
export function entriesOf<T extends Record<string, unknown>>(obj: T) {
  return Object.entries(obj) as [keyof T & string, T[keyof T]][];
}

/** Clamps a page number coming from an untrusted query string. */
export function toPageNumber(raw: string | undefined, max = 500): number {
  const n = Number.parseInt(raw ?? '1', 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, max);
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
