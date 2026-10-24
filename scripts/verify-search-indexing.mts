/**
 * §23 — which search URLs may be indexed, and which header queries are
 * allowed to run twice.
 *
 * Both rules are cheap to get wrong and expensive to notice. The indexing one
 * was wrong for as long as it existed: it tested `q` and `locality` only, so
 * `?listing=sale&type=villa&max_price=…` and every sort order declared itself
 * indexable while its canonical pointed back at plain `/properties`. Eleven of
 * those URLs are linked from the nav and footer, so crawlers found them
 * immediately.
 *
 * The deduplication one is a structural check rather than a behavioural test:
 * `cache()` is request-scoped, so proving it works needs a live request, which
 * is what the audit measured. What this guards is the regression — somebody
 * unwrapping these helpers later and nothing noticing until a plain page is
 * issuing four `properties` queries again.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseFilters,
  isIndexableSearch,
  type SearchParamsInput,
} from '@/lib/properties/filters';
import { searchCanonical, type LandingIndexInput } from '@/lib/seo/search-canonical';
import type { ResolvedPlace } from '@/lib/seo/places';

let passed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean, detail = '') {
  if (condition) passed++;
  else failures.push(`${label}${detail ? `\n      ${detail}` : ''}`);
}

/** Runs the real parser, so these are URLs rather than hand-built objects. */
function indexable(params: SearchParamsInput): boolean {
  return isIndexableSearch(parseFilters(params));
}

// ---------------------------------------------------------------------------
// The one page that should be indexed
// ---------------------------------------------------------------------------
check('bare /properties is indexable', indexable({}));
check('an unknown parameter does not change it', indexable({ utm_source: 'x' }));
check('page=1 stated explicitly is still it', indexable({ page: '1' }));
check('sort=relevance stated explicitly is still it', indexable({ sort: 'relevance' }));
check('view=list stated explicitly is still it', indexable({ view: 'list' }));

// ---------------------------------------------------------------------------
// Everything else is a near-duplicate of it
// ---------------------------------------------------------------------------
const notIndexable: [string, SearchParamsInput][] = [
  ['a listing type', { listing: 'sale' }],
  ['a property type', { type: 'villa' }],
  ['the pair the nav links to', { listing: 'sale', type: 'villa' }],
  ['a city', { city: 'Coimbatore' }],
  ['a locality', { locality: 'Saravanampatti' }],
  ['a keyword', { q: 'plot' }],
  ['a maximum price', { max_price: '5000000' }],
  ['a minimum price', { min_price: '1000000' }],
  ['a BHK', { bhk: '3' }],
  ['an area bound', { min_area: '1000' }],
  ['bathrooms', { bath: '2' }],
  ['furnishing', { furnishing: 'fully_furnished' }],
  ['parking', { parking: '1' }],
  ['facing', { facing: 'east' }],
  ['verified only', { verified: '1' }],
  ['a seller type', { seller: 'owner' }],
  ['posted within', { posted: '7' }],
  ['page two', { page: '2' }],
  ['a non-default sort', { sort: 'price_asc' }],
  ['the newest sort', { sort: 'newest' }],
  ['featured only', { featured: '1' }],
  ['grid view', { view: 'grid' }],
  ['a filter plus a sort', { listing: 'rent', sort: 'price_desc' }],
  ['a sort on page two', { page: '2', sort: 'area_asc' }],
];

for (const [label, params] of notIndexable) {
  check(`not indexable: ${label}`, !indexable(params), JSON.stringify(params));
}

// ---------------------------------------------------------------------------
// Which city searches may point their canonical at a landing page
//
// `searchCanonical` takes the two database answers as arguments — the resolved
// place and the inventory predicate — so the whole decision is exercised here
// with fixtures instead of a seeded database. Nothing below is skipped or
// conditional: every case asserts a canonical and an indexable flag.
// ---------------------------------------------------------------------------

/** A city-level catalog entry, with the catalog's own capitalisation. */
const COIMBATORE: ResolvedPlace = { city: 'Coimbatore', state: 'TN', locality: null };
/** A locality-level entry — it has its own landing page, not the city's. */
const SARAVANAMPATTI: ResolvedPlace = { city: 'Coimbatore', state: 'TN', locality: 'Saravanampatti' };

const hasInventory = () => true;
const noInventory = () => false;

function decide(
  params: SearchParamsInput,
  place: ResolvedPlace | null,
  isWorthIndexing: (input: LandingIndexInput) => boolean = hasInventory,
) {
  return searchCanonical(parseFilters(params), { place, isWorthIndexing });
}

function expectDecision(
  label: string,
  actual: { canonical: string; indexable: boolean },
  expected: { canonical: string; indexable: boolean },
) {
  check(
    label,
    actual.canonical === expected.canonical && actual.indexable === expected.indexable,
    `expected ${expected.canonical} / indexable=${expected.indexable}, got ${actual.canonical} / indexable=${actual.indexable}`,
  );
}

/** The filtered-search policy every failing case must fall back to. */
const FILTERED = { canonical: '/properties', indexable: false };

// --- Group 1: a valid city, with inventory -> the landing page, no noindex ---
expectDecision(
  'a city + sale maps to the sale landing page and stays indexable',
  decide({ city: 'Coimbatore', listing: 'sale' }, COIMBATORE),
  { canonical: '/property-for-sale-in-coimbatore', indexable: true },
);
expectDecision(
  'a city + rent maps to the rent landing page',
  decide({ city: 'Coimbatore', listing: 'rent' }, COIMBATORE),
  { canonical: '/property-for-rent-in-coimbatore', indexable: true },
);
expectDecision(
  'a city + pg maps to the pg landing page',
  decide({ city: 'Coimbatore', listing: 'pg' }, COIMBATORE),
  { canonical: '/pg-in-coimbatore', indexable: true },
);
expectDecision(
  'the catalog spelling wins, so one city is one canonical',
  decide({ city: 'cOiMbAtOrE', listing: 'sale' }, COIMBATORE),
  { canonical: '/property-for-sale-in-coimbatore', indexable: true },
);
expectDecision(
  'view=grid is the same listings, so it still maps',
  decide({ city: 'Coimbatore', listing: 'sale', view: 'grid' }, COIMBATORE),
  { canonical: '/property-for-sale-in-coimbatore', indexable: true },
);

/** The predicate must be asked about the catalog's city, not the typed one. */
const asked: LandingIndexInput[] = [];
decide({ city: 'cOiMbAtOrE', listing: 'rent' }, COIMBATORE, (input) => {
  asked.push(input);
  return true;
});
check(
  'the inventory question uses the catalog city, at city level, with no type',
  asked.length === 1 &&
    asked[0]!.city === 'Coimbatore' &&
    asked[0]!.locality === null &&
    asked[0]!.listing === 'rent' &&
    asked[0]!.typeSlug === null,
  JSON.stringify(asked),
);

// --- Group 2: the place does not resolve -> no landing canonical ------------
expectDecision(
  'an unresolved city falls back to the filtered-search policy',
  decide({ city: 'Nowhereville', listing: 'sale' }, null),
  FILTERED,
);
check(
  'an unresolved city never canonicals to a landing URL that would 404',
  decide({ city: 'Nowhereville', listing: 'sale' }, null).canonical !== '/property-for-sale-in-nowhereville',
  'this is the bug: the canonical used to be built from the raw ?city= string',
);
expectDecision(
  'a place that resolves to a locality is not the city landing page',
  decide({ city: 'Coimbatore', listing: 'sale' }, SARAVANAMPATTI),
  FILTERED,
);
expectDecision(
  'a resolved place for a different city does not count',
  decide({ city: 'Chennai', listing: 'sale' }, COIMBATORE),
  FILTERED,
);

// --- Group 3: resolves, but the landing page is not worth indexing ----------
expectDecision(
  'a city with no indexable inventory keeps noindex and /properties',
  decide({ city: 'Coimbatore', listing: 'sale' }, COIMBATORE, noInventory),
  FILTERED,
);
check(
  'and never canonicals at a landing page that is itself noindex',
  decide({ city: 'Coimbatore', listing: 'sale' }, COIMBATORE, noInventory).canonical === '/properties',
  'pointing a canonical at a noindex page consolidates nothing',
);

// --- Group 4: listing-type and filter mismatches ----------------------------
expectDecision(
  'a city with no listing type does not map — it shows sale, rent and pg',
  decide({ city: 'Coimbatore' }, COIMBATORE),
  FILTERED,
);
check(
  'specifically, it does not assume sale',
  decide({ city: 'Coimbatore' }, COIMBATORE).canonical !== '/property-for-sale-in-coimbatore',
  'the old rule defaulted to sale and canonicalised a mixed result set onto it',
);

const mismatches: [string, SearchParamsInput][] = [
  ['a locality narrows it further', { city: 'Coimbatore', listing: 'sale', locality: 'Saravanampatti' }],
  ['a keyword', { city: 'Coimbatore', listing: 'sale', q: 'plot' }],
  ['a property type', { city: 'Coimbatore', listing: 'sale', type: 'villa' }],
  ['a maximum price', { city: 'Coimbatore', listing: 'sale', max_price: '5000000' }],
  ['a minimum price', { city: 'Coimbatore', listing: 'sale', min_price: '100000' }],
  ['an area bound', { city: 'Coimbatore', listing: 'sale', min_area: '1000' }],
  ['a BHK', { city: 'Coimbatore', listing: 'sale', bhk: '3' }],
  ['bathrooms', { city: 'Coimbatore', listing: 'sale', bath: '2' }],
  ['furnishing', { city: 'Coimbatore', listing: 'sale', furnishing: 'fully_furnished' }],
  ['parking', { city: 'Coimbatore', listing: 'sale', parking: '1' }],
  ['facing', { city: 'Coimbatore', listing: 'sale', facing: 'east' }],
  ['verified only', { city: 'Coimbatore', listing: 'sale', verified: '1' }],
  ['a seller type', { city: 'Coimbatore', listing: 'sale', seller: 'owner' }],
  ['posted within', { city: 'Coimbatore', listing: 'sale', posted: '7' }],
  ['featured only', { city: 'Coimbatore', listing: 'sale', featured: '1' }],
  ['page two', { city: 'Coimbatore', listing: 'sale', page: '2' }],
  ['a non-default sort', { city: 'Coimbatore', listing: 'sale', sort: 'price_asc' }],
];

for (const [label, params] of mismatches) {
  expectDecision(`not a landing duplicate: ${label}`, decide(params, COIMBATORE), FILTERED);
}

// --- And the index page itself is unaffected by any of the above ------------
expectDecision(
  'bare /properties is still self-canonical and indexable',
  decide({}, null),
  { canonical: '/properties', indexable: true },
);
expectDecision(
  'a bare filter with no city is still the filtered-search policy',
  decide({ type: 'villa' }, null),
  FILTERED,
);

// ---------------------------------------------------------------------------
// The route must not reintroduce either half of the old bug
// ---------------------------------------------------------------------------
const routeSource = readFileSync(join(process.cwd(), 'app/(public)/properties/page.tsx'), 'utf8');
check(
  'the route does not default the listing type when building a canonical',
  !/listing:\s*filters\.listing\s*\?\?/.test(routeSource),
  "`filters.listing ?? 'sale'` canonicalises a mixed result set onto the sale page",
);
check(
  'the route asks searchCanonical rather than deciding inline',
  routeSource.includes('searchCanonical('),
  'the canonical and the robots directive have to be one decision',
);
check(
  'the route resolves the place before canonicalising to a landing page',
  routeSource.includes('resolvePlace(') && routeSource.includes('landingIsWorthIndexing'),
  'without both, the canonical can point at a 404 or at a noindex page',
);

const homeSource = readFileSync(join(process.cwd(), 'app/(public)/page.tsx'), 'utf8');
check(
  'the home page links Popular locations at the landing pages',
  homeSource.includes("landingPath({ city: location.city, listing: 'sale' })"),
  'linking at /properties?city= spends the strongest page on the site on a noindex URL',
);
check(
  'and no longer links them at the search query string',
  !/href=\{`\/properties\?city=/.test(homeSource),
  'the search URL disclaims itself; the landing page is the indexable surface',
);

// ---------------------------------------------------------------------------
// The rule must not drift from the filter list again
// ---------------------------------------------------------------------------
const filtersSource = readFileSync(join(process.cwd(), 'lib/properties/filters.ts'), 'utf8');
check(
  'isIndexableSearch is built on activeFilterCount, not a restated list',
  /export function isIndexableSearch[\s\S]{0,400}activeFilterCount\(filters\) === 0/.test(filtersSource),
  'a hand-written filter list here will go stale the next time one is added',
);

// ---------------------------------------------------------------------------
// Header query deduplication
// ---------------------------------------------------------------------------
const queriesSource = readFileSync(join(process.cwd(), 'lib/properties/queries.ts'), 'utf8');

for (const fn of ['getActiveCities', 'getSearchPlaces']) {
  check(
    `${fn} is wrapped in cache() so it runs once per request`,
    new RegExp(`export const ${fn} = cache\\(`).test(queriesSource),
    'without it the header reads the whole published set twice on every render',
  );
}

check(
  'cache is imported from react, not a time-based cache',
  /^import \{ cache \} from 'react';/m.test(queriesSource),
  "unstable_cache would persist across requests and show a stale city list",
);

// ---------------------------------------------------------------------------
// The search row is route-scoped, not rendered by the shared header
// ---------------------------------------------------------------------------
const headerSource = readFileSync(join(process.cwd(), 'components/layout/site-header.tsx'), 'utf8');
check(
  'SiteHeader does not fetch the search data itself',
  !headerSource.includes('<HeaderSearchSlot'),
  'rendering it here runs the city and place queries on every page that has a header',
);

const SLOT_DIR = join(process.cwd(), 'app/(public)/@search');

check(
  '@search has a default.tsx',
  existsSync(join(SLOT_DIR, 'default.tsx')),
  'without it a hard navigation to any public page without a slot match 404s',
);

/**
 * Every row the slot renders must sit at a path that actually exists, or the
 * search box appears above a 404 — and the slot silently falls through to
 * `default` if the name is misspelled, which looks exactly like "no search row
 * on this page" rather than like a mistake.
 */
for (const entry of readdirSync(SLOT_DIR, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  check(
    `@search/${entry.name} mirrors a real route`,
    existsSync(join(process.cwd(), 'app/(public)', entry.name, 'page.tsx')),
    `app/(public)/${entry.name}/page.tsx does not exist`,
  );
}

const layoutSource = readFileSync(join(process.cwd(), 'app/(public)/layout.tsx'), 'utf8');
check(
  'the (public) layout accepts the slot and hands it to the header',
  /search: React\.ReactNode/.test(layoutSource) && /searchSlot=\{search\}/.test(layoutSource),
  'a slot nothing renders is a folder Next.js quietly ignores',
);

/**
 * The route decides, and only the route. A path check inside the client
 * component would veto the slot after the data had already been fetched —
 * which is the bug this whole change removed.
 */
const searchSource = readFileSync(join(process.cwd(), 'components/layout/header-search.tsx'), 'utf8');
check(
  'HeaderSearch does not gate itself on the pathname',
  !searchSource.includes('usePathname'),
  'a second gate here makes a newly added @search route render nothing',
);

// ---------------------------------------------------------------------------
if (failures.length === 0) {
  console.log(`PASS — ${passed} passed, 0 failed`);
  console.log('Search indexing and header query deduplication hold.');
} else {
  console.log(`FAIL — ${passed} passed, ${failures.length} failed`);
  for (const f of failures) console.log(`  FAIL  ${f}`);
  process.exitCode = 1;
}
