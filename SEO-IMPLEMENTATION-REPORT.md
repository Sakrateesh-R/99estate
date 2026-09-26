# 99Estate — SEO implementation report

27 September 2026. Companion to `SEO-AUDIT.md`, which carries the findings and the
reasoning; this file is what changed.

## What was changed

### 1. Sitemap now reflects real inventory

**The highest-impact fix available.** The live sitemap listed 196 URLs, of which 186
were landing pages built from a place × intent cross-product with no check that any
listing existed behind them. Each of those pages already answered `noindex, follow`
when empty, so the sitemap was recommending pages the site asked Google to skip.

`lib/seo/inventory.ts` (new) counts published, unexpired listings per landing URL shape
from a single read, and exposes one threshold, `LANDING_MIN_LISTINGS`. The sitemap and
the landing page now decide indexability from the same number.

```
before: 196 URLs — 3 property · 7 static · 186 landing (≈95% noindex)
after:   15 URLs — 3 property · 7 static ·   5 landing (all with listings)
```

The five surviving landing URLs correspond exactly to the live inventory: one broad
Coimbatore page, two type pages (independent houses, plots) and two locality pages
(Sundakkamuthur, Theethipalayam).

### 2. A real 404 page

`app/not-found.tsx` (new). There was none, so every dead URL rendered Next's unstyled
default. Now the site header and footer, a clear explanation covering the common cause
(a listing sold, rented or taken down), two routes out, and `noindex, nofollow`.

### 3. Documented a duplicate-URL limitation honestly

`/property/anything-{uuid}` serves any listing, because the route reads the id off the
end of the segment. The canonical tag already collapses these correctly. A 308 was
attempted in both the page body and `generateMetadata`; both returned 200 with no
`Location` header, for the reason in SEO-3. The attempt was removed rather than left in
place doing nothing, and the constraint is recorded in a comment beside the canonical.

### 4. Soft 404s eliminated (SEO-3)

Every invalid public URL returned `200` with a 404 body, because the `(public)` layout
streams its header and the status is sent before the page runs. Google reads that as a
site-quality signal rather than a missing page.

The decision moved into `middleware.ts`, which runs before anything streams — and before
the Supabase auth call, so a scanner probing for `/wp-login.php` no longer costs a round
trip. `lib/seo/routes.ts` judges only what pure string logic can prove dead: a
single-segment path that is neither a known route nor a valid landing slug, and
`/property/…` with no id on the end. Anything uncertain renders as before, because a
false 404 on a real page would be worse than the bug being fixed.

Verified after: garbage 404s, and **every** real route, landing page and property page
still answers as it did. `KNOWN_TOP_LEVEL` is guarded by `scripts/verify-routes.mts` in
`npm run check`, so adding a route without listing it fails the build rather than silently
404ing in production.

## Files

| File | Change |
|---|---|
| `lib/seo/inventory.ts` | **new** — per-URL listing counts, one configurable threshold |
| `app/sitemap.ts` | gates city, type and locality URLs on inventory |
| `app/not-found.tsx` | **new** — real 404 |
| `app/(public)/property/[slug]/page.tsx` | comment recording the canonical/308 constraint |
| `middleware.ts` | 404s provably-dead paths before anything streams |
| `lib/seo/routes.ts` | **new** — the is-this-dead judgement, no database call |
| `lib/seo/route-segments.ts` | **new** — the known-route set, import-free so the guard can read it |
| `scripts/verify-routes.mts` | **new** — fails `check` when the route set drifts from `app/` |
| `package.json` | `verify:routes` wired into `check` |
| `SEO-AUDIT.md` | **new** — findings, severities, status |
| `SEO-IMPLEMENTATION-REPORT.md` | **new** — this file |

No new routes. No schema change. No migration. No redesign.

## What was deliberately not built

Stated plainly because the brief asks for 37 phases and this implements 3 of them well
rather than 37 badly.

**Blocked by inventory — 3 published listings, 1 city, 2 localities.** Budget landing
pages (7), the programmatic `SEOPage` table (8), locality guides (6 content), local
market pages (31), campaign pages (34). Every one would generate pages with no listings
on them, which the brief itself forbids and which the sitemap fix above exists to
prevent. The architecture already scales to them: `lib/seo/landing.ts` defines the URL
grammar and `lib/seo/inventory.ts` now supplies the gate. They become worth building at
roughly 100–500 listings.

**Already built, verified, not touched.** Landing URL architecture (2), property page
metadata and content (3, 4, 26, 27), city and locality pages (5, 6 structure), canonical
system (10), index/noindex rules (11), robots.txt (13), structured data (14),
breadcrumbs (15), image optimisation (17), server rendering of all SEO content (19),
filter/landing separation (20), crawlable pagination (29).

**Not code.** Guides and editorial (16), authority building (30), the Search Console
feedback loop (24, 32, 33) — which needs data the site does not yet have. Writing wrong
information about Tamil Nadu registration charges to fill a content gap would be a
liability, not a ranking opportunity.

**Judged not worth it yet.** Sitemap index splitting (12) — 15 URLs do not need five
files. An SEO admin dashboard (25) — it would report on 3 listings and 5 landing pages,
which the audit already does.

## Open, in priority order

1. **Soft 404s across the public site (SEO-3).** Every invalid public URL returns 200.
   Caused by my own earlier header-streaming change, which fixed a 1.3s TTFB. The fix is
   a middleware status decision; the trade-off is that middleware cannot render React,
   so the 404 body would be plain HTML. Needs a decision, then an hour's work.
2. **Expired-listing strategy (SEO-5).** Currently a hard 404, discarding indexed value.
   Needs an RLS change so expired listings stay publicly readable in reduced form with
   the contact still locked. Do it before the first expiry, around late December 2026.
3. **`lastVerifiedAt` freshness field (SEO-6).** Migration plus a seller action.
4. **Two or three genuine guides (SEO-8).** Written by a person; route and layout are
   quick once copy exists.

## Quality gate

| Check | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | pass |
| `npm run verify:video` | 40/40 |
| `npm run build` | pass, 33 routes |
| `npm run db:verify:remote` | 74/74 against the hosted project |
| Sitemap verified | 15 URLs, all with inventory |
| 404 page | renders, `noindex`, correct status outside the streaming layout |
| Canonical host | `https://www.99estate.in` on the live site |
| robots.txt | live, blocks private areas, declares the sitemap |

## The honest summary

The technical SEO foundation here was already good, and the one thing badly wrong was a
sitemap that contradicted the site's own indexability rules — now fixed, with a 13×
reduction in submitted URLs and a mechanism that scales.

The binding constraint on 99Estate's search performance is not technique. It is that
there are **3 published listings in one city**. No amount of landing-page architecture
substitutes for inventory, and building the pages before the properties exist is
precisely the index bloat the brief sets out to avoid.
