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
export function propertyPath(property: {
  id: string;
  slug?: string | null;
  public_code?: string | null;
}) {
  /**
   * The short code when the caller has it, the UUID when it does not.
   *
   * Both forms resolve, and middleware sends the UUID form to the code form
   * with a 301 — so a query that forgets to select `public_code` produces a
   * working link that corrects itself rather than a broken one. That is what
   * makes it safe for the 17 call sites to be updated gradually.
   */
  const ref = property.public_code ?? property.id;
  return property.slug ? `/property/${property.slug}-${ref}` : `/property/${ref}`;
}

const UUID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/**
 * Crockford base32 without I, L, O and U, uppercase.
 *
 * Case matters: slugs are lowercase, so requiring uppercase is what stops a
 * listing whose slug happens to end in a seven-letter word from being read as
 * a code. Anchored at the end, same as the UUID.
 */
const PUBLIC_CODE_RE = /-([0-9A-HJKMNP-TV-Z]{7})$/;

export type PropertyRef =
  | { kind: 'id'; value: string }
  | { kind: 'code'; value: string };

/**
 * Reads the listing out of a `/property/<slug>-<ref>` segment.
 *
 * UUID first: it is the older form, it is unambiguous, and checking it first
 * means a legacy link can never be mistaken for a code.
 */
export function propertyRefFromSlug(slugWithRef: string): PropertyRef | null {
  const uuid = UUID_RE.exec(slugWithRef);
  if (uuid) return { kind: 'id', value: uuid[1]!.toLowerCase() };

  const code = PUBLIC_CODE_RE.exec(slugWithRef);
  if (code) return { kind: 'code', value: code[1]! };

  // A bare code with no slug in front of it, which is what `/property/<code>`
  // is after a listing loses its slug.
  if (/^[0-9A-HJKMNP-TV-Z]{7}$/.test(slugWithRef)) {
    return { kind: 'code', value: slugWithRef };
  }

  return null;
}

/**
 * The listing id, when the segment carries one.
 *
 * Kept for the callers that genuinely need an id and cannot take a code — the
 * soft-404 shape check being the main one, since it must not touch a database.
 */
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
