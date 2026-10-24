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
import { parseFilters, isIndexableSearch, type SearchParamsInput } from '../lib/properties/filters.ts';

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
