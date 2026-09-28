/**
 * End-to-end checks that only a real HTTP request can make.
 *
 * `verify-remote.mjs` talks to the database and nothing else, which is why it
 * has now twice reported everything green while the app was broken: it called
 * the RPC directly and so proved the RPC worked, never that the page called it.
 * View tracking was dead from the day it shipped — `after()` cannot touch
 * `headers()`, the throw went into a bare `catch {}`, and every listing read
 * "0 views", which looks exactly like having no visitors.
 *
 * So the rule these assertions follow: go through the front door. Fetch the
 * page a visitor would fetch, then look at what the database ended up with.
 *
 *   node --env-file=.env.local scripts/verify-pages.mjs
 *   VERIFY_BASE_URL=https://www.99estate.in node --env-file=.env.local scripts/verify-pages.mjs
 *
 * Every row it writes is removed again before it exits, including the
 * trigger-maintained counter, so it can be pointed at production.
 */
import { createClient } from '@supabase/supabase-js';

const BASE = (process.env.VERIFY_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let passed = 0;
const failures = [];

function check(label, ok, detail = '') {
  if (ok) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const viewCount = async (propertyId) =>
  (await db.from('property_views').select('*', { count: 'exact', head: true }).eq('property_id', propertyId)).count;

/** `after()` is fire-and-forget: the response arrives before the write lands. */
async function settle(propertyId, want, tries = 12) {
  for (let i = 0; i < tries; i++) {
    if ((await viewCount(propertyId)) >= want) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return viewCount(propertyId);
}

async function main() {
  console.log(`\nverify-pages against ${BASE}\n`);

  const { data: listing } = await db
    .from('properties')
    .select('id, slug, views_count')
    .eq('status', 'published')
    .limit(1)
    .maybeSingle();

  if (!listing) {
    console.log('  SKIP  no published listing to test against');
    return;
  }

  const url = `${BASE}/property/${listing.slug}-${listing.id}`;

  /**
   * Which rows already existed, so cleanup can delete only what this run wrote.
   *
   * The visitor hash is salted and computed server-side from the IP the server
   * sees, so it cannot be recomputed here to match on. Deleting by property id
   * would take real visitors' views with it — and this script is meant to be
   * safe to point at production.
   */
  const { data: pre } = await db.from('property_views').select('id').eq('property_id', listing.id);
  const preExisting = new Set((pre ?? []).map((r) => r.id));
  const before = preExisting.size;
  // Unique per run, so a re-run is not mistaken for a returning visitor.
  const agent = `verify-pages/${process.pid}-${before}`;
  let written = 0;

  try {
    const first = await fetch(url, { headers: { 'user-agent': agent, 'cache-control': 'no-cache' } });
    check('a published listing renders', first.status === 200, `HTTP ${first.status}`);

    const afterFirst = await settle(listing.id, before + 1);
    written = afterFirst - before;
    check('visiting the page records a view', afterFirst === before + 1, `${before} -> ${afterFirst} rows`);

    // The point of hashing IP + user agent: a refresh is the same visitor.
    await fetch(url, { headers: { 'user-agent': agent, 'cache-control': 'no-cache' } });
    await new Promise((r) => setTimeout(r, 4000));
    const afterRefresh = await viewCount(listing.id);
    written = afterRefresh - before;
    check('a refresh is not counted twice', afterRefresh === afterFirst, `${afterFirst} -> ${afterRefresh} rows`);

    const { data: counter } = await db.from('properties').select('views_count').eq('id', listing.id).single();
    check(
      'views_count keeps step with the rows',
      counter.views_count === listing.views_count + written,
      `counter ${counter.views_count}, expected ${listing.views_count + written}`,
    );

    // The soft-404 fix: a well-formed id that resolves to nothing.
    const gone = await fetch(`${BASE}/property/a-listing-that-is-gone-00000000-0000-4000-8000-000000000000`, {
      redirect: 'manual',
    });
    check('a listing that is gone answers 404', gone.status === 404, `HTTP ${gone.status}`);
    check(
      'the 404 is not indexable',
      (gone.headers.get('x-robots-tag') ?? '').includes('noindex'),
      `x-robots-tag: ${gone.headers.get('x-robots-tag')}`,
    );
  } finally {
    const { data: post } = await db.from('property_views').select('id').eq('property_id', listing.id);
    const mine = (post ?? []).map((r) => r.id).filter((id) => !preExisting.has(id));

    if (mine.length > 0) {
      await db.from('property_views').delete().in('id', mine);
      // The counter is incremented by trigger on insert and never decremented,
      // so it has to be put back by hand.
      await db.from('properties').update({ views_count: listing.views_count }).eq('id', listing.id);

      const left = await viewCount(listing.id);
      const { data: restored } = await db.from('properties').select('views_count').eq('id', listing.id).single();
      console.log(
        `\n  cleaned up ${mine.length} row${mine.length === 1 ? '' : 's'} this run wrote` +
          ` — ${left} left on the listing (${before} before), views_count back to ${restored.views_count}`,
      );
    }
  }
}

main()
  .then(() => {
    console.log(`\n${failures.length === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failures.length} failed`);
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(failures.length === 0 ? 0 : 1);
  })
  .catch((error) => {
    console.error('\nverify-pages could not run:', error.message);
    process.exit(1);
  });
