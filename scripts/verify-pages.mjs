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

/**
 * The one invariant the whole business model rests on: a seller's number is
 * visible to the buyer who unlocked it and to nobody else.
 *
 * Asserted through the front door for the same reason as the view checks above.
 * It is here because it has already failed once: both personal views ended their
 * WHERE clause with `or public.is_admin()`, and every caller filtered by
 * property without naming a buyer, so an admin opening the contacts page read
 * somebody else's purchased number. A database-only test cannot see that — the
 * view returns the right rows to the right role when asked as that role, and the
 * bug was that the page never asked.
 *
 * Sessions are minted with the admin API rather than by signing in, so this
 * needs no passwords and changes nobody's credentials.
 */
/**
 * The two session helpers, at module scope so more than one section can reach
 * them. They were local to `checkContactIsolation` until the project pages
 * needed the same trick — the alternative was a second copy of the cookie
 * chunking, which is exactly the sort of thing that drifts.
 */
const PROJECT_REF = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0];

/** Supabase splits an oversized auth cookie across numbered parts; so must we. */
const cookieFor = (session) => {
  const value = 'base64-' + Buffer.from(JSON.stringify(session), 'utf8').toString('base64url');
  const name = `sb-${PROJECT_REF}-auth-token`;
  if (value.length <= 3180) return `${name}=${value}`;
  const parts = [];
  for (let i = 0, n = 0; i < value.length; i += 3180, n++) {
    parts.push(`${name}.${n}=${value.slice(i, i + 3180)}`);
  }
  return parts.join('; ');
};

/** Minted with the admin API, so this needs no password and changes no credentials. */
async function sessionFor(email) {
  const { data: link, error } = await db.auth.admin.generateLink({ type: 'magiclink', email });
  if (error) return null;
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data, error: verifyError } = await anon.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: 'magiclink',
  });
  return verifyError ? null : data.session;
}

async function checkContactIsolation() {
  const { data: unlock } = await db
    .from('contact_unlocks')
    .select('user_id, seller_id, property_id')
    .eq('payment_status', 'success')
    .limit(1)
    .maybeSingle();

  if (!unlock) {
    console.log('  SKIP  contact isolation — no settled unlock to test with');
    return;
  }

  const { data: seller } = await db
    .from('profiles')
    .select('mobile_number')
    .eq('id', unlock.seller_id)
    .single();
  const secret = String(seller.mobile_number).replace(/\D/g, '').slice(-10);

  /**
   * The grid has to be asked for a page the listing is actually on.
   *
   * `/properties` unqualified was the original target, and it worked right up
   * until the project had more than one page of inventory — at 38 published
   * listings and 24 per page, the unlocked listing had simply fallen off page
   * one and the assertion started failing for a reason that had nothing to do
   * with contact isolation. A search narrowed to the listing's own title is
   * stable however much inventory arrives.
   *
   * The negative assertions below use the same URL, which matters more: the
   * question they ask is whether somebody *else* can see the number on a page
   * that definitely contains the listing. Pointing them at a page the listing
   * had dropped off made them pass for the wrong reason.
   */
  const { data: unlocked } = await db
    .from('properties')
    .select('title, city')
    .eq('id', unlock.property_id)
    .single();
  const term = unlocked.title.split(/\s+/).slice(0, 4).join(' ');
  const gridPath = `/properties?q=${encodeURIComponent(term)}`;

  // Everyone who is not the buyer, and can actually sign in.
  const { data: others } = await db
    .from('profiles')
    .select('id, email, full_name, role')
    .neq('id', unlock.user_id);

  const { data: buyer } = await db.from('profiles').select('email').eq('id', unlock.user_id).single();
  const buyerSession = await sessionFor(buyer.email);

  const pages = ['/dashboard/contacts', gridPath];
  const shows = (html) => html.includes(secret) || html.includes(secret.replace(/(\d{5})(\d{5})/, '$1 $2'));

  if (buyerSession) {
    for (const path of pages) {
      const html = await (await fetch(BASE + path, { headers: { cookie: cookieFor(buyerSession) } })).text();
      check(`the buyer who unlocked it sees the number on ${path}`, shows(html));
    }
  }

  for (const person of others ?? []) {
    if (String(person.email).endsWith('placeholder.invalid')) continue;
    const session = await sessionFor(person.email);
    if (!session) continue;

    for (const path of pages) {
      const html = await (await fetch(BASE + path, { headers: { cookie: cookieFor(session) } })).text();
      check(
        `${person.role} "${person.full_name}" cannot see it on ${path}`,
        !shows(html),
        shows(html) ? 'the number is in the page' : '',
      );
    }
  }

  // Same narrowed URL as above, for the same reason: a negative assertion
  // against a page the listing is not even on proves nothing.
  const anon = await (await fetch(BASE + gridPath)).text();
  check('a signed-out visitor cannot see it on the grid', !shows(anon));
}

/**
 * The map must not give away what the address costs.
 *
 * Same rule as the contact: a signed-out visitor gets the neighbourhood, the
 * buyer who unlocked gets the pin. Checked in the page source rather than by
 * looking at the map, because the failure mode here is invisible on screen —
 * coordinates sitting in structured data or a serialised prop while the visible
 * embed shows only the locality.
 *
 * Skips when no listing has a pin yet, which is honest: there is nothing to
 * leak until a seller pastes a Maps link.
 */
async function checkLocationPrivacy() {
  const { data: pinned } = await db
    .from('properties')
    .select('id, slug, latitude, longitude')
    .eq('status', 'published')
    .not('latitude', 'is', null)
    .limit(1)
    .maybeSingle();

  if (!pinned) {
    console.log('  SKIP  location privacy — no listing has a map pin yet');
    return;
  }

  const url = `${BASE}/property/${pinned.slug}-${pinned.id}`;
  const html = await (await fetch(url, { headers: { 'cache-control': 'no-cache' } })).text();
  const exact = [String(pinned.latitude), String(pinned.longitude)];

  check(
    'a signed-out visitor gets no exact coordinates',
    !exact.some((n) => html.includes(n)),
    'a coordinate appears in the page source',
  );
  check('a signed-out visitor still gets an area map', html.includes('Around this area'));
}

/**
 * §4, §5, §27–§30 — the public builder and project pages, through the front
 * door.
 *
 * Seeds a company, one published project with inventory and one draft, fetches
 * every page as a visitor would, then deletes the company. The cascade takes
 * the projects, their units, amenities and any enquiry raised against them, and
 * it runs in a `finally` so a failed assertion cannot leave fixture inventory
 * on a live database.
 *
 * The view-counter assertion is the reason this belongs here rather than in
 * `verify-remote.mjs`: that suite would call `record_project_view` and prove
 * the RPC works, which is precisely how listing view tracking stayed dead for
 * weeks. This fetches the page and then looks at the column.
 */
async function checkProjectPages() {
  const stamp = process.hrtime.bigint().toString(36);
  let orgId = null;

  try {
    const org = await db
      .from('organizations')
      .insert({
        name: `Verify Builders ${stamp}`,
        org_types: ['builder', 'developer'],
        city: 'Karur',
        state: 'Tamil Nadu',
        about: 'Fixture company created by verify-pages.',
        established_year: 2011,
        rera_number: `TN/RERA/${stamp.toUpperCase()}`,
        phone: '9000000190',
        email: 'fixture@example.invalid',
        gst_number: '33AAAAA0000A1Z5',
      })
      .select('id, slug, name')
      .maybeSingle();

    if (org.error) {
      console.log(`  SKIP  project pages — could not seed a company (${org.error.message})`);
      return;
    }
    orgId = org.data.id;

    const project = await db
      .from('projects')
      .insert({
        organization_id: orgId,
        name: `Green Valley ${stamp}`,
        project_type: 'apartment',
        status: 'under_construction',
        city: 'Karur',
        locality: 'Thanthoni',
        description: 'Fixture project created by verify-pages.',
        total_units: 120,
        price_min: 5500000,
        price_max: 8200000,
        bedroom_options: [2, 3],
        construction_progress_percentage: 40,
        construction_progress_note: 'Tower A slab at the 7th floor.',
        is_published: true,
        published_at: new Date().toISOString(),
      })
      .select('id, slug, name, views_count')
      .maybeSingle();
    if (project.error) throw new Error(`seed project: ${project.error.message}`);

    const draft = await db
      .from('projects')
      .insert({
        organization_id: orgId,
        name: `Hidden Draft ${stamp}`,
        project_type: 'plot',
        city: 'Karur',
        is_published: false,
      })
      .select('slug')
      .maybeSingle();

    const units = await db
      .from('project_units')
      .insert([
        {
          project_id: project.data.id, unit_number: 'A-101', unit_type: '2 BHK',
          property_type: 'apartment', bedrooms: 2, built_up_area: 1150, area_unit: 'sqft',
          price: 5500000, facing: 'north_east', floor_number: 1, status: 'available',
        },
        {
          project_id: project.data.id, unit_number: 'A-102', unit_type: '3 BHK',
          property_type: 'apartment', bedrooms: 3, built_up_area: 1480, area_unit: 'sqft',
          price: 8200000, facing: 'east', floor_number: 1, status: 'sold',
        },
      ])
      .select('id, unit_number, status');
    if (units.error) throw new Error(`seed units: ${units.error.message}`);

    await db.from('project_amenities').insert({
      project_id: project.data.id,
      amenity_name: 'Swimming Pool',
    });

    const slug = project.data.slug;
    const orgSlug = org.data.slug;
    const available = units.data.find((u) => u.status === 'available');
    const sold = units.data.find((u) => u.status === 'sold');

    const get = async (path, cookie) => {
      const res = await fetch(`${BASE}${path}`, {
        headers: { Accept: 'text/html', 'cache-control': 'no-cache', ...(cookie ? { cookie } : {}) },
        redirect: 'manual',
      });
      return { status: res.status, html: await res.text() };
    };

    // ---- The index -------------------------------------------------------
    const index = await get('/projects');
    check('the project index renders', index.status === 200, `status ${index.status}`);
    check('the index lists a published project', index.html.includes(project.data.name));
    check('the index hides a draft', !index.html.includes(`Hidden Draft ${stamp}`));

    const filtered = await get('/projects?city=Karur&type=apartment');
    check('a filtered index asks not to be indexed', /noindex/.test(filtered.html));
    check('the bare index does not', !/noindex/.test(index.html));

    // ---- The project page ------------------------------------------------
    const detail = await get(`/projects/${slug}`);
    check('the project page renders', detail.status === 200, `status ${detail.status}`);
    check('it credits the builder and links the profile',
      detail.html.includes(org.data.name) && detail.html.includes(`/builders/${orgSlug}`));
    check('the unit table lists both units',
      detail.html.includes('A-101') && detail.html.includes('A-102'));
    check('only the available unit can be enquired about',
      detail.html.includes(`unit=${available.id}`) && !detail.html.includes(`unit=${sold.id}`));

    // §8 — the claim has to name who is making it. `40` and `% complete` are
    // separate text nodes, so React SSR puts a comment marker between them.
    check('construction progress is attributed to the builder',
      /40<!-- -->% complete/.test(detail.html) && detail.html.includes('Reported by the builder'));
    check('construction progress is never presented as ours',
      !detail.html.includes('Verified by 99Estate'));

    // §4 — none of these columns are in `builder_public_profiles`.
    const builderPage = await get(`/builders/${orgSlug}`);
    check('the builder profile renders', builderPage.status === 200, `status ${builderPage.status}`);
    check('it lists the live project but not the draft',
      builderPage.html.includes(project.data.name) &&
        !builderPage.html.includes(`Hidden Draft ${stamp}`));
    for (const [what, secret] of [
      ['phone', '9000000190'],
      ['email', 'fixture@example.invalid'],
      ['GST number', '33AAAAA0000A1Z5'],
    ]) {
      check(`no company ${what} on the public pages`,
        !builderPage.html.includes(secret) && !detail.html.includes(secret));
    }

    // ---- Who is offered the form -----------------------------------------
    check('a signed-out visitor is asked to sign in, not shown the form',
      detail.html.includes('Sign in to enquire') && !detail.html.includes('name="contact_mobile"'));

    const { data: buyer } = await db
      .from('profiles')
      .select('email, mobile_number')
      .eq('role', 'buyer')
      .not('mobile_number', 'is', null)
      .limit(1)
      .maybeSingle();

    if (buyer?.email) {
      const session = await sessionFor(buyer.email);
      if (session) {
        const signedIn = await get(`/projects/${slug}`, cookieFor(session));
        check('a signed-in visitor gets the enquiry form',
          signedIn.html.includes('name="contact_mobile"'),
          'the form did not render for a session');
        /**
         * Rule 8, at the form. The number on their account is not prefilled,
         * because what reaches the builder must be only what the buyer chose to
         * type — the profile number is reserved for a settled ₹9 unlock.
         */
        const accountNumber = String(buyer.mobile_number).replace(/\D/g, '').slice(-10);
        check('their account mobile number is not prefilled',
          !signedIn.html.includes(`value="${accountNumber}"`), accountNumber);
      } else {
        console.log('  SKIP  signed-in enquiry form — could not mint a session');
      }
    } else {
      console.log('  SKIP  signed-in enquiry form — no reachable buyer to borrow');
    }

    // ---- Gone, and how gone ----------------------------------------------
    // A segment that was never slug-shaped is judged in middleware, which still
    // owns the status. A well-formed slug with nothing behind it cannot be, so
    // it falls through to the page after the layout has flushed 200 — a soft
    // 404 whose `noindex` is what keeps it out of the index.
    const malformed = await get('/projects/wp-login.php');
    check('a path that was never a slug is a real 404', malformed.status === 404,
      `status ${malformed.status}`);

    const missing = await get('/projects/no-such-project-anywhere');
    check('a well-formed but unknown project is noindexed',
      missing.html.includes('Project not found') && /noindex/.test(missing.html));

    const hidden = await get(`/projects/${draft.data.slug}`);
    check('a draft project is not readable by the public',
      hidden.html.includes('Project not found') && /noindex/.test(hidden.html));

    // ---- The sitemap -----------------------------------------------------
    const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text();
    check('the sitemap advertises the project and the builder',
      sitemap.includes(`/projects/${slug}`) && sitemap.includes(`/builders/${orgSlug}`));
    check('the sitemap does not advertise the draft', !sitemap.includes(draft.data.slug));

    // ---- The view counter, through the front door -------------------------
    const before = await db.from('projects').select('views_count').eq('id', project.data.id).single();
    await get(`/projects/${slug}`);
    // `after()` runs once the response has been sent, so give it a moment.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const afterView = await db.from('projects').select('views_count').eq('id', project.data.id).single();
    check('fetching the project page counts a view',
      afterView.data.views_count > before.data.views_count,
      `${before.data.views_count} -> ${afterView.data.views_count}`);

    // ---- Suspension -------------------------------------------------------
    await db.rpc('admin_verify_organization', {
      p_organization_id: orgId,
      p_status: 'suspended',
      p_notes: 'fixture',
    });
    const suspended = await get(`/projects/${slug}`);
    check('suspending the company takes its project page down',
      suspended.html.includes('Project not found'), `status ${suspended.status}`);
  } finally {
    if (orgId) {
      const { error } = await db.from('organizations').delete().eq('id', orgId);
      if (error) console.log(`  CLEANUP FAILED: fixture company ${orgId} — ${error.message}`);
      else console.log('  (fixture company deleted; its projects and units cascaded)');
    }
  }
}

main()
  .then(() => checkContactIsolation())
  .then(() => checkLocationPrivacy())
  .then(() => checkProjectPages())
  .then(() => {
    console.log(`\n${failures.length === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failures.length} failed`);
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(failures.length === 0 ? 0 : 1);
  })
  .catch((error) => {
    console.error('\nverify-pages could not run:', error.message);
    process.exit(1);
  });
