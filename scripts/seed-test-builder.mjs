/**
 * Seeds one builder company so the project surfaces can be exercised.
 *
 *   node --env-file=.env.local scripts/seed-test-builder.mjs
 *   node --env-file=.env.local scripts/seed-test-builder.mjs --remove
 *
 * There is no such thing as signing in as a company, so this cannot hand over
 * a company credential. What it does instead is make the real Google accounts
 * on this project members of one company, each with a different role, so
 * whichever one you sign in as you land somewhere useful — and the roles can
 * be compared against each other.
 *
 * The project is left UNPUBLISHED on purpose. A member can still open its
 * public page (`projects_select_own` lets them read their own drafts), so the
 * whole flow is previewable without putting a test company on the live site.
 * Pressing Publish in the dashboard is what makes it public, and that is a
 * decision for whoever runs this, not for a seed script.
 *
 * Everything it creates hangs off one `organizations` row, so `--remove`
 * deletes exactly one record and the cascade takes the rest.
 */
import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const SLUG = 'kongu-estates-test';
const REMOVE = process.argv.includes('--remove');

/**
 * Who gets which seat.
 *
 * The owner is deliberately *not* the admin account. `organizations_guard_write`
 * and friends return early for `is_admin()`, so an admin never exercises the
 * pins that constrain a real builder — testing as one would show you a flow
 * nobody else gets. The admin is included as a viewer so the account can still
 * see the company, and the platform-admin powers are reached from /admin.
 *
 * Only accounts belonging to whoever runs this project. The first version of
 * this list seated two accounts that turned out to be real users of the live
 * site, which put a fake company in a stranger's dashboard. `assertSeatable`
 * below refuses that now, rather than trusting this list to stay right.
 */
const SEATS = [
  { email: 'sakrateesh007@gmail.com', role: 'owner' },
  { email: 'swathithangavelutester@gmail.com', role: 'sales_manager' },
  { email: 'sakrateesh777@gmail.com', role: 'viewer' },
];

/**
 * Refuses to seat an account that looks like a real user of the live site.
 *
 * This exists because the list above was wrong once and nothing caught it. A
 * comment asking the next person to be careful is not a safeguard; a query is.
 *
 * The test is ownership of real inventory: a listing, or being the seller side
 * of a lead. Buyer-side unlocks are deliberately not disqualifying — those are
 * what you get from exercising the paywall with your own account, which most of
 * these seats have done.
 */
async function assertSeatable(profile) {
  const [{ count: listings }, { count: sellerLeads }] = await Promise.all([
    db.from('properties').select('id', { count: 'exact', head: true }).eq('seller_id', profile.id),
    db.from('leads').select('id', { count: 'exact', head: true }).eq('seller_id', profile.id),
  ]);

  if (listings > 0 || sellerLeads > 0) {
    throw new Error(
      `${profile.email} has ${listings} listing(s) and ${sellerLeads} seller-side lead(s), so it ` +
        `looks like a real user of the live site. Refusing to seat it in a test company. Remove ` +
        `it from SEATS, or use an account you own.`,
    );
  }
}

async function remove() {
  const { data } = await db.from('organizations').select('id, name').eq('slug', SLUG).maybeSingle();
  if (!data) {
    console.log(`Nothing to remove — no company with slug "${SLUG}".`);
    return;
  }
  const { error } = await db.from('organizations').delete().eq('id', data.id);
  if (error) throw new Error(error.message);
  console.log(`Removed "${data.name}" and everything that cascaded from it.`);
}

async function seed() {
  const existing = await db.from('organizations').select('id').eq('slug', SLUG).maybeSingle();
  if (existing.data) {
    console.log(`"${SLUG}" already exists. Run with --remove first to start clean.`);
    return;
  }

  // Resolve the seats to real profiles; skip any account that is not on this
  // project rather than failing the whole seed.
  const { data: profiles } = await db
    .from('profiles')
    .select('id, email, full_name')
    .in('email', SEATS.map((s) => s.email));

  const byEmail = new Map((profiles ?? []).map((p) => [p.email, p]));
  const owner = byEmail.get(SEATS[0].email);
  if (!owner) throw new Error(`the intended owner ${SEATS[0].email} has no profile on this project`);

  // Before writing anything: every seat has to clear the real-user check, and a
  // single failure aborts the whole seed rather than seating the others.
  for (const profile of byEmail.values()) await assertSeatable(profile);

  const org = await db
    .from('organizations')
    .insert({
      // `created_by` is what the seed-owner trigger reads, so this account
      // becomes the OWNER without a second statement.
      created_by: owner.id,
      name: 'Kongu Estates (test)',
      slug: SLUG,
      org_types: ['builder', 'developer', 'promoter'],
      about:
        'A test company seeded by scripts/seed-test-builder.mjs so the builder dashboard and ' +
        'project pages can be exercised. Not a real business.',
      established_year: 2014,
      city: 'Karur',
      state: 'Tamil Nadu',
      locality: 'Thanthoni',
      phone: '9000000190',
      email: 'test@example.invalid',
      website: 'https://example.invalid',
      office_address: '12, Kovai Road, Thanthoni, Karur',
      pincode: '639002',
      rera_number: 'TN/RERA/TEST/0001',
    })
    .select('id, name, slug')
    .single();
  if (org.error) throw new Error(`company: ${org.error.message}`);

  // The owner membership already exists courtesy of the trigger; add the rest.
  const extra = SEATS.slice(1)
    .map((seat) => ({ seat, profile: byEmail.get(seat.email) }))
    .filter((x) => x.profile);

  if (extra.length > 0) {
    const { error } = await db.from('organization_members').insert(
      extra.map(({ seat, profile }) => ({
        organization_id: org.data.id,
        user_id: profile.id,
        role: seat.role,
        status: 'active',
      })),
    );
    if (error) throw new Error(`team: ${error.message}`);
  }

  const project = await db
    .from('projects')
    .insert({
      organization_id: org.data.id,
      created_by: owner.id,
      name: 'Kongu Riverside',
      project_type: 'apartment',
      property_types: ['apartment'],
      status: 'under_construction',
      city: 'Karur',
      locality: 'Thanthoni',
      state: 'Tamil Nadu',
      pincode: '639002',
      address: 'Survey 114/2, Riverside Road, Thanthoni, Karur',
      description:
        'Two towers of 2 and 3 BHK apartments beside the Amaravathi, with a clubhouse and ' +
        'covered parking. Seeded test data — not a real project.',
      total_area: 3.5,
      total_area_unit: 'acre',
      total_units: 120,
      price_min: 5500000,
      price_max: 8200000,
      bedroom_options: [2, 3],
      launch_date: '2026-02-01',
      expected_completion_date: '2028-09-30',
      construction_progress_percentage: 40,
      construction_progress_note: 'Tower A slab cast to the 7th floor.',
      rera_number: 'TN/RERA/P/TEST/0001',
      // Left as a draft. See the note at the top of this file.
      is_published: false,
    })
    .select('id, name, slug')
    .single();
  if (project.error) throw new Error(`project: ${project.error.message}`);

  // A plot layout too, so the other shape of inventory is covered: §15 units
  // with no building and no floor.
  const layout = await db
    .from('projects')
    .insert({
      organization_id: org.data.id,
      created_by: owner.id,
      name: 'Kongu Garden Plots',
      project_type: 'plot',
      status: 'ready_to_move',
      city: 'Karur',
      locality: 'Vangal',
      total_area: 6,
      total_area_unit: 'acre',
      total_units: 48,
      price_min: 1800000,
      price_max: 3200000,
      description: 'DTCP approved plot layout. Seeded test data.',
      is_published: false,
    })
    .select('id, slug')
    .single();
  if (layout.error) throw new Error(`layout: ${layout.error.message}`);

  const tower = await db
    .from('project_buildings')
    .insert({ project_id: project.data.id, name: 'Tower A', code: 'A', total_floors: 11, status: 'under_construction' })
    .select('id')
    .single();

  const floors = await db
    .from('project_floors')
    .insert(
      [1, 2, 3].map((n) => ({
        building_id: tower.data.id,
        floor_number: n,
        display_name: `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : 'rd'} Floor`,
      })),
    )
    .select('id, floor_number');

  const floorId = (n) => floors.data.find((f) => f.floor_number === n)?.id ?? null;

  // A spread of statuses, so the unit table shows more than "all available".
  const flats = [];
  for (const n of [1, 2, 3]) {
    for (const [suffix, bhk, area, price] of [
      ['01', 2, 1150, 5500000],
      ['02', 3, 1480, 8200000],
    ]) {
      flats.push({
        project_id: project.data.id,
        building_id: tower.data.id,
        floor_id: floorId(n),
        unit_number: `A-${n}${suffix}`,
        unit_type: `${bhk} BHK`,
        property_type: 'apartment',
        bedrooms: bhk,
        bathrooms: bhk,
        balconies: 1,
        built_up_area: area,
        area_unit: 'sqft',
        price: price + n * 100000,
        facing: suffix === '01' ? 'north_east' : 'east',
        floor_number: n,
        status: n === 1 && suffix === '02' ? 'sold' : n === 2 && suffix === '01' ? 'booked' : 'available',
      });
    }
  }
  const units = await db.from('project_units').insert(flats).select('id');
  if (units.error) throw new Error(`units: ${units.error.message}`);

  const plots = await db
    .from('project_units')
    .insert(
      [1, 2, 3, 4].map((n) => ({
        project_id: layout.data.id,
        unit_number: `P-${n}`,
        property_type: 'residential_plot',
        land_area: 2400 + n * 200,
        area_unit: 'sqft',
        price: 1800000 + n * 150000,
        plot_dimensions: '40x60',
        is_corner: n === 1,
        status: n === 4 ? 'sold' : 'available',
        layout_row: 1,
        layout_col: n,
      })),
    )
    .select('id');
  if (plots.error) throw new Error(`plots: ${plots.error.message}`);

  await db.from('project_amenities').insert(
    ['Swimming Pool', 'Gymnasium', 'Clubhouse', 'Children Play Area', 'Power Backup'].map((name) => ({
      project_id: project.data.id,
      amenity_name: name,
    })),
  );

  console.log(`\nSeeded "${org.data.name}"\n`);
  console.log('  Team');
  for (const { seat, profile } of [{ seat: SEATS[0], profile: owner }, ...extra]) {
    console.log(`    ${seat.role.padEnd(14)} ${profile.email}`);
  }
  for (const email of SEATS.map((s) => s.email).filter((e) => !byEmail.has(e))) {
    console.log(`    (skipped — no profile) ${email}`);
  }
  console.log('\n  Projects, both unpublished');
  console.log(`    /projects/${project.data.slug}   6 flats across 3 floors of Tower A`);
  console.log(`    /projects/${layout.data.slug}   4 plots`);
  console.log(`\n  Builder profile  /builders/${org.data.slug}`);
  console.log('\n  Remove it all with:  node --env-file=.env.local scripts/seed-test-builder.mjs --remove\n');
}

(REMOVE ? remove() : seed()).catch((error) => {
  console.error(`\nseed-test-builder failed: ${error.message}\n`);
  process.exit(1);
});
