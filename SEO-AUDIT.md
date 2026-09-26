# 99Estate — SEO audit

Audited 27 September 2026 against the live site (`https://www.99estate.in`) and the
codebase at commit `9ba6a61`.

## Scope note, read this first

The brief asks for 37 phases. A large part of it is **already built** — the landing
page architecture, canonical system, structured data, breadcrumbs, dynamic sitemap
and index/noindex rules all exist and are mostly correct. The audit below says so
rather than re-proposing them.

The rest of the brief is **premature at current inventory**, and saying so is part of
the job:

| Live inventory, 27 Sep 2026 | |
|---|---|
| Published listings | **3** |
| Cities with listings | **1** (Coimbatore) |
| Localities with listings | **2** (Sundakkamuthur, Theethipalayam) |
| Recorded property views | **0** |

Phases 7 (budget pages), 8 (programmatic `SEOPage` table), 16 (guide content), 25
(SEO dashboard), 30 (authority), 31 (local content), 34 (campaign pages) would all
produce pages with nothing on them. The brief's own rule — *"only make a landing page
indexable when it has meaningful inventory"* — rules them out for now. They become
worth building somewhere around 100–500 listings.

---

## Part 1 — What already exists and works

Verified in code and against the live site.

| Area | Status | Where |
|---|---|---|
| Framework | Next.js 15.5.15, App Router, React 19 | — |
| Rendering | Dynamic SSR for all data-backed routes; static for `robots`/`sitemap`/OG image | build output |
| Property URLs | `/property/{readable-slug}-{uuid}` | `lib/utils.ts` |
| Landing URLs | `/property-for-sale-in-coimbatore`, `/plots-for-sale-in-coimbatore`, `/property-for-sale-in-sundakkamuthur-coimbatore`, `/pg-in-{place}` | `lib/seo/landing.ts` |
| Place resolution | Slugs resolved against `locations` **and** published listings, so a landing URL never 404s from a seller's free-text locality | `lib/seo/places.ts` |
| Canonical host | `https://www.99estate.in` — correct on the live site | `lib/env.ts` |
| Property metadata | Dynamic title/description from real data (BHK, type, locality, city, price); OG + Twitter with the primary image | `property/[slug]/page.tsx` |
| Filter canonicalisation | `/properties?…` canonicalises to the landing URL when a filter set maps to one, and is `noindex, follow` otherwise | `properties/page.tsx` |
| Index/noindex | Landing pages `noindex` when empty or paginated past page 1; properties `noindex` unless `published` | landing + property pages |
| Structured data | Organization, WebSite, BreadcrumbList, ItemList, FAQ, plus a listing graph | `lib/seo/json-ld.tsx` |
| Breadcrumbs | Visible **and** `BreadcrumbList` JSON-LD, pointing at real landing URLs | property + landing pages |
| Pagination | Crawlable `?page=` links, page > 1 `noindex, follow` | landing page |
| Images | `next/image`, AVIF/WebP, browser-side downscale to 1920px + WebP before upload, `priority` on the first two, `sizes` set | `image-uploader.tsx`, gallery |
| robots.txt | Live and correct: allows `/`, blocks `/dashboard`, `/admin`, `/api/`, `/auth/`, `/login`, `/complete-profile`, `/saved`; declares the sitemap | `app/robots.ts` |
| HTTPS | Enforced, `www` canonical | — |
| Security headers | `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy` present | — |

---

## Part 2 — Findings

### SEO-1 · Sitemap advertised 186 `noindex` URLs — **FIXED**

**Severity: critical.** `app/sitemap.ts`

The live sitemap contained **196 URLs: 3 property pages, 7 static, and 186 landing
pages.** It built a cross-product of the 12-city `locations` catalog × listing types ×
type groups without checking whether any listing existed behind each URL. Every one of
those pages correctly answers `noindex, follow` when it has no results — verified on
`/property-for-sale-in-ahmedabad` — so ~95% of the submitted sitemap asked Google not
to index it.

On a new domain with no authority, that spends the entire crawl budget discovering
nothing and produces a wall of *"Discovered – currently not indexed"*.

**Fix:** new `lib/seo/inventory.ts` counts published, unexpired listings per landing
URL shape. The sitemap now includes a URL only at or above `LANDING_MIN_LISTINGS`
(currently 1). The page and the sitemap now read the same count, so they can no longer
disagree.

**Result: 196 → 15 URLs** (3 property, 7 static, 5 landing), and the 5 are exactly the
ones with inventory:

```
/property-for-sale-in-coimbatore
/independent-houses-for-sale-in-coimbatore
/plots-for-sale-in-coimbatore
/property-for-sale-in-sundakkamuthur-coimbatore
/property-for-sale-in-theethipalayam-coimbatore
```

This is also what makes the architecture scale: at 10,000 listings the sitemap grows
with real inventory instead of with the catalog.

### SEO-2 · No 404 page — **FIXED**

**Severity: high.** `app/not-found.tsx` (new)

There was no `not-found.tsx` anywhere, so dead URLs rendered Next's unstyled default:
one line of text, no header, no way onward. Now a real page with `noindex, nofollow`
and two concrete routes out.

### SEO-3 · Every public URL returns 200 instead of 404 — **OPEN, regression**

**Severity: high.** `components/layout/site-header.tsx`, `app/(public)/layout.tsx`

Soft 404s across the whole public site. Measured:

| URL | Status | Should be |
|---|---|---|
| `/foo/bar` (no `SiteHeader` in chain) | **404** ✓ | 404 |
| `/no-such-page` (through `(public)` layout) | **200** ✗ | 404 |
| `/property/x-{unknown-uuid}` | **200** ✗ | 404 |

Same on production.

**Cause, and it is mine.** Commit `be733e1` moved the header's four Supabase queries
behind Suspense to fix a 1.3s time-to-first-byte. That works — TTFB dropped to 0.32s —
but it means the shell, and therefore `HTTP 200`, is flushed *before* the page
component runs. Once headers are sent the status cannot change, so `notFound()` renders
the 404 body under a 200.

Tested and ruled out: removing the `loading.tsx` files does not restore the 404, and
neither `notFound()` nor `permanentRedirect()` works from `generateMetadata` — both
still returned 200.

**Options, none free:**

1. **Middleware** decides the status before rendering. Correct, and the only reliable
   place in a streaming app. For unresolvable single-segment paths it needs no database
   — `parseLandingSlug` is pure string logic — so typos, probes and stale links can be
   404'd for free. The cost is that middleware cannot render React, so the body would
   be plain HTML rather than the styled page.
2. **Revert the header to blocking.** Restores correct statuses everywhere and costs
   ~1s of TTFB on every page.
3. **Leave it.** Google treats soft 404s as a site-quality signal. Not advisable.

Recommendation: option 1, with the trade-off on the body being the user's call.

### SEO-4 · One listing is reachable at unlimited URLs — **MITIGATED, not fixed**

**Severity: medium.** `app/(public)/property/[slug]/page.tsx`

The route reads the UUID off the end of the segment and ignores everything before it,
so `/property/buy-cheap-flats-coimbatore-spam-{uuid}` returns 200 with identical
content — verified live. Anyone can mint duplicate URLs for any listing.

`alternates.canonical` is emitted correctly and points at the real URL, which is what
collapses them for Google. A 308 would be stronger but is blocked by SEO-3: tried in
both the page body and `generateMetadata`, both returned 200 with no `Location` header.
Doing it properly means a database lookup in middleware on every property request,
which is a poor trade against a canonical that already works.

Revisit if Search Console reports duplicate URLs being indexed.

### SEO-5 · Expired listings hard-404 — **OPEN**

**Severity: medium.** `lib/properties/detail.ts`

RLS hides non-published listings from anonymous visitors, so `getPropertyDetail`
returns null and the page 404s. For a listing Google has already indexed and ranked,
that discards the accumulated value at the moment the seller's 90-day window closes.

The brief's preferred behaviour — 200 with "no longer available" plus similar
properties and locality links — needs a deliberate RLS change so expired listings stay
publicly readable in a reduced form. That is a schema and policy decision, not a
tweak, and it interacts with the paywall (the contact must stay locked). Worth doing
before the first listings expire — the earliest is ~90 days from 26 Sep 2026.

### SEO-6 · No `lastVerifiedAt` — **OPEN**

**Severity: low.** Phase 23 asks for a freshness signal a seller can refresh.
`properties` has `created_at`, `updated_at`, `published_at`, `last_renewed_at` — enough
to display "Last updated" honestly, which the property page already does. A separate
"seller confirmed this is still available" field would be a real addition, and needs a
migration plus a seller-facing action.

### SEO-7 · Sitemap is a single file — **DEFERRED, correct as-is**

Phase 12 asks for a sitemap index with `/sitemaps/properties.xml` etc. At 15 URLs a
single sitemap is right; splitting would add files with nothing in them. The 50,000-URL
cap is the real trigger, and `MAX_PROPERTY_URLS` is already set to 20,000. Revisit at
a few thousand listings.

### SEO-8 · No guide/editorial content — **OPEN, deliberately not auto-generated**

Phase 16 lists buying guides, registration charges, document checklists. These are
worth having and are **writing work, not code**. The brief also says not to
mass-generate AI articles, which I agree with — five genuinely useful, locally accurate
guides will outperform fifty generated ones, and wrong information about Tamil Nadu
registration charges is a liability rather than a ranking opportunity. A route and
layout can be built when there is copy to put in it.

### SEO-9 · Core Web Vitals — partially addressed

TTFB improved 1.3s → 0.32s (`be733e1`) and route-level skeletons now prevent the blank
wait. Images are downscaled client-side, served as WebP/AVIF through `next/image` with
explicit dimensions, so CLS is controlled and LCP has the right priority hints. Not
measured against field data — there is no traffic yet. Re-audit with real Search
Console CWV data once there is.

### SEO-10 · Search Console readiness

Ownership verification token is in the root layout. `robots.txt`, `sitemap.xml`,
canonicals, HTTPS and mobile rendering all check out. **SEO-3 is the blocker worth
fixing before submitting the sitemap**, because soft 404s discovered early shape how
the site is crawled.

---

## Priority order

1. **SEO-3** — soft 404s. Highest remaining impact, and a regression to undo.
2. **SEO-5** — expired-listing strategy, before the first expiry (~late Dec 2026).
3. Add listings. At 3 published properties, inventory is the binding constraint on
   every SEO outcome, not technique. The architecture is ready for 10,000; it has 3.
4. **SEO-8** — two or three genuinely useful guides, written by a person.
5. Re-audit with real Search Console data. Phases 24, 32 and 33 are feedback loops and
   need data to run against; claiming otherwise would be guessing.
