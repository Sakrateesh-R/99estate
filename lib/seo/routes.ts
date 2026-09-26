import { parseLandingSlug } from '@/lib/seo/landing';
import { KNOWN_TOP_LEVEL } from '@/lib/seo/route-segments';
import { propertyIdFromSlug } from '@/lib/utils';

/**
 * §23 — which public paths cannot possibly resolve, decided without a database.
 *
 * This exists to fix soft 404s. The `(public)` layout streams its header behind
 * Suspense, so `HTTP 200` is flushed before the page component runs and
 * `notFound()` can no longer set a status — every dead public URL answered 200
 * with a 404 body, which Google reads as a site-quality problem rather than a
 * missing page. Middleware runs before any of that and can still send a real
 * status, so the judgement moves here.
 *
 * Deliberately conservative. A false positive 404s a real page, which is far
 * worse than the soft 404 this replaces, so anything not provably dead is let
 * through to render normally. Two things are provably dead:
 *
 *   - a single-segment path that is neither a known route nor a landing slug
 *   - a `/property/...` path with no listing id on the end of it
 *
 * Both are pure string work. What needs the database — a landing slug naming a
 * city we do not cover, or a well-formed id for a listing that does not exist —
 * is left to the page, because a lookup here would tax every request to the
 * pages that matter most.
 */

// The set itself lives in `route-segments.ts`, which imports nothing so the
// `npm run check` guard can read it without resolving the `@/` alias. Re-exported
// here so callers have one obvious place to look.
export { KNOWN_TOP_LEVEL } from '@/lib/seo/route-segments';

/**
 * True only when the path definitely has nothing behind it.
 *
 * Returning false means "not sure" as well as "fine" — the caller renders as
 * usual either way.
 */
export function isDefinitelyNotFound(pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean);

  // The home page, and anything three levels deep, are not this function's
  // business: the app has no three-segment public routes to misjudge.
  if (segments.length === 0) return false;

  const [first, second] = segments;

  if (segments.length === 1) {
    if (KNOWN_TOP_LEVEL.has(first!)) return false;
    // A landing slug is recognisable by shape. Whether the place exists is the
    // page's call, so a well-formed slug is allowed through.
    return parseLandingSlug(first!) === null;
  }

  if (segments.length === 2 && first === 'property') {
    // `/property/<anything>` only resolves when an id is on the end of it.
    return propertyIdFromSlug(second!) === null;
  }

  return false;
}

/**
 * A minimal 404 body.
 *
 * Middleware cannot render React, so this is hand-written rather than the
 * styled `app/not-found.tsx` — which still handles every case middleware
 * declines to judge. Kept small and self-contained on purpose: it needs no CSS
 * file, no fonts and no JavaScript, so it cannot itself fail.
 */
export function notFoundHtml(siteName: string): string {
  return `<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Page not found · ${siteName}</title>
<style>
  :root { color-scheme: light }
  body { margin:0; min-height:100dvh; display:grid; place-items:center; background:#f7f8fa;
         font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; color:#343945 }
  main { max-width:32rem; padding:2.5rem 1.5rem; text-align:center }
  p.code { margin:0; font-size:.8125rem; font-weight:600; letter-spacing:.08em;
           text-transform:uppercase; color:#0c6852 }
  h1 { margin:.5rem 0 0; font-size:1.5rem; line-height:1.25; color:#12151c }
  p.lead { margin:.75rem 0 0; color:#556075 }
  .actions { margin-top:1.75rem; display:flex; gap:.625rem; justify-content:center; flex-wrap:wrap }
  a { display:inline-block; padding:.7rem 1.1rem; border-radius:.625rem; text-decoration:none;
      font-size:.9375rem; font-weight:600 }
  a.primary { background:#0c6852; color:#fff }
  a.secondary { background:#fff; color:#454e5f; border:1px solid #d8dde6; font-weight:500 }
</style>
</head>
<body>
  <main>
    <p class="code">404</p>
    <h1>We could not find that page</h1>
    <p class="lead">The address may be mistyped, or the listing may have been sold, rented or taken down by its owner.</p>
    <div class="actions">
      <a class="primary" href="/properties">Search properties</a>
      <a class="secondary" href="/">Go to the home page</a>
    </div>
  </main>
</body>
</html>`;
}
