/**
 * Seeds demo data into a hosted Supabase project.
 *
 * `supabase/seed.sql` only runs on a local `db reset`, and it inserts straight
 * into `auth.users` — acceptable on a throwaway local stack, wrong against a
 * real project. This script goes through the supported paths instead:
 * GoTrue's admin API for accounts, PostgREST for rows, and the real
 * `admin_approve_property()` RPC for moderation.
 *
 * Idempotent: re-running it does not duplicate users or listings.
 *
 *   node --env-file=.env.local scripts/seed-remote.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
if (url.includes('127.0.0.1') || url.includes('localhost')) {
  console.error('This script targets a hosted project. For local, use: npx supabase db reset');
  process.exit(1);
}

const db = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const step = (msg) => console.log(`  ${msg}`);

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------
/**
 * Never hardcode this.
 *
 * These accounts are real and one of them is an admin. The Supabase project
 * ref is public the moment the site is deployed (it ships in the client
 * bundle), so a working password committed here would be an account takeover
 * waiting to happen.
 *
 * Set DEMO_PASSWORD to choose one; otherwise a random password is generated
 * and printed once, and nobody — including us — can sign in as these accounts
 * without it.
 */
const DEMO_PASSWORD =
  process.env.DEMO_PASSWORD ?? `demo-${randomUUID().replace(/-/g, '').slice(0, 20)}!Aa1`;

const ACCOUNTS = [
  { key: 'seller', email: 'demo.seller@99estate.dev', name: 'Meera Krishnan', mobile: '9840012301', role: 'owner' },
  { key: 'agent', email: 'demo.agent@99estate.dev', name: 'Karthik Realty', mobile: '9840012302', role: 'agent' },
  { key: 'buyer', email: 'demo.buyer@99estate.dev', name: 'Arjun Nair', mobile: '9840012303', role: 'buyer' },
  { key: 'admin', email: 'demo.admin@99estate.dev', name: 'Priya Admin', mobile: '9840012304', role: 'admin' },
];

async function findUserByEmail(email) {
  // listUsers is paginated; the demo project is small enough that one page of
  // 200 covers it comfortably.
  const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw new Error(`listUsers: ${error.message}`);
  return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

async function ensureAccounts() {
  const ids = {};

  for (const account of ACCOUNTS) {
    let user = await findUserByEmail(account.email);

    if (!user) {
      const { data, error } = await db.auth.admin.createUser({
        email: account.email,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: account.name },
      });
      if (error) throw new Error(`createUser ${account.email}: ${error.message}`);
      user = data.user;
      step(`created ${account.email}`);
    } else {
      step(`reusing ${account.email}`);
    }

    // The auth trigger creates the profile row; we only fill in what Google
    // would not have given us.
    const { error } = await db
      .from('profiles')
      .update({ full_name: account.name, mobile_number: account.mobile, role: account.role })
      .eq('id', user.id);
    if (error) throw new Error(`profile ${account.email}: ${error.message}`);

    ids[account.key] = user.id;
  }

  return ids;
}

// ---------------------------------------------------------------------------
// Listings
// ---------------------------------------------------------------------------
function listings(ids) {
  return [
    {
      seller_id: ids.seller,
      title: '3 BHK apartment in Saravanampatti with covered parking',
      description:
        'Spacious east-facing 3 BHK on the 4th floor of a gated community, five minutes from the IT park. Covered parking, 24x7 water and full power backup. Schools, a hospital and two supermarkets are within a kilometre.',
      property_type: 'apartment', listing_type: 'sale', price: 6500000, is_negotiable: true,
      area: 1250, area_unit: 'sqft', bedrooms: 3, bathrooms: 2, balconies: 2,
      floor_number: 4, total_floors: 12, property_age: 5, furnishing_status: 'semi_furnished',
      parking: 1, facing: 'east', state: 'Tamil Nadu', city: 'Coimbatore',
      locality: 'Saravanampatti', pincode: '641035',
      address: 'Flat 4B, Green Meadows, 2nd Street', latitude: 11.0785, longitude: 76.9966,
      featured: true,
    },
    {
      seller_id: ids.seller,
      title: '2 BHK flat for rent near Gandhipuram bus stand',
      description:
        'Well-maintained 2 BHK a short walk from the Gandhipuram bus stand. Semi-furnished with wardrobes and a modular kitchen. Ideal for a small family or working professionals. Deposit negotiable for a longer lease.',
      property_type: 'apartment', listing_type: 'rent', price: 18000, is_negotiable: true,
      area: 900, area_unit: 'sqft', bedrooms: 2, bathrooms: 2, balconies: 1,
      floor_number: 2, total_floors: 5, property_age: 9, furnishing_status: 'semi_furnished',
      parking: 1, facing: 'north', state: 'Tamil Nadu', city: 'Coimbatore',
      locality: 'Gandhipuram', pincode: '641012',
      address: '12/4 Cross Cut Road', latitude: 11.0168, longitude: 76.9658,
    },
    {
      seller_id: ids.agent,
      title: 'Independent house in RS Puram with private garden',
      description:
        'Four bedroom independent house on a quiet residential street in RS Puram. Built on 2400 sq.ft with a private garden, two-car covered parking and a separate servant quarter. Clear title, ready to move in.',
      property_type: 'independent_house', listing_type: 'sale', price: 14500000, is_negotiable: false,
      area: 2400, area_unit: 'sqft', bedrooms: 4, bathrooms: 3, balconies: 2,
      floor_number: 0, total_floors: 2, property_age: 12, furnishing_status: 'unfurnished',
      parking: 2, facing: 'north_east', state: 'Tamil Nadu', city: 'Coimbatore',
      locality: 'RS Puram', pincode: '641002',
      address: '48 West Lokamanya Street', latitude: 11.0063, longitude: 76.9476,
      featured: true,
    },
    {
      seller_id: ids.agent,
      title: '2 BHK apartment for sale in Velachery, Chennai',
      description:
        'Compact and efficient 2 BHK in a well-run society off the 100 Feet Road. Walking distance to the MRTS station and Phoenix Marketcity. Lift, generator backup and CCTV throughout the block.',
      property_type: 'apartment', listing_type: 'sale', price: 8900000, is_negotiable: true,
      area: 1050, area_unit: 'sqft', bedrooms: 2, bathrooms: 2, balconies: 1,
      floor_number: 7, total_floors: 11, property_age: 7, furnishing_status: 'fully_furnished',
      parking: 1, facing: 'west', state: 'Tamil Nadu', city: 'Chennai',
      locality: 'Velachery', pincode: '600042',
      address: 'Block C, Lakeview Residency', latitude: 12.9795, longitude: 80.2218,
    },
    {
      seller_id: ids.seller,
      title: 'Residential plot for sale in Whitefield, Bengaluru',
      description:
        'North-facing 2400 sq.ft residential plot in an approved layout with clear title and all civic approvals in place. Water and electricity connections available at the plot boundary. Ready for immediate construction.',
      property_type: 'residential_plot', listing_type: 'sale', price: 19500000, is_negotiable: true,
      area: 2400, area_unit: 'sqft', parking: 0, facing: 'north',
      state: 'Karnataka', city: 'Bengaluru', locality: 'Whitefield', pincode: '560066',
      address: 'Site 17, Palm Grove Layout', latitude: 12.9698, longitude: 77.7499,
    },
    {
      seller_id: ids.agent,
      title: 'Furnished studio apartment for rent in Hitech City',
      description:
        'Fully furnished studio in a serviced block minutes from the Hitech City MMTS. Includes air conditioning, a modular kitchenette, high-speed internet and weekly housekeeping. Suited to a single professional.',
      property_type: 'studio', listing_type: 'rent', price: 24000, is_negotiable: false,
      area: 520, area_unit: 'sqft', bedrooms: 1, bathrooms: 1, balconies: 1,
      floor_number: 9, total_floors: 18, property_age: 3, furnishing_status: 'fully_furnished',
      parking: 1, facing: 'south_east', state: 'Telangana', city: 'Hyderabad',
      locality: 'Hitech City', pincode: '500081',
      address: 'Tower B, Cyber Heights', latitude: 17.4486, longitude: 78.3812,
    },
  ];
}

const SHARED_AMENITIES = ['Lift', 'Power Backup', 'Covered Parking', 'Security', '24x7 Water Supply'];
const LARGE_HOME_AMENITIES = ['Gated Community', 'Park / Garden', 'Gymnasium'];

async function ensureListings(ids) {
  const created = [];

  for (const { featured, ...listing } of listings(ids)) {
    const { data: existing } = await db
      .from('properties')
      .select('id')
      .eq('seller_id', listing.seller_id)
      .eq('title', listing.title)
      .maybeSingle();

    if (existing) {
      step(`reusing listing "${listing.title.slice(0, 45)}…"`);
      created.push({ id: existing.id, featured });
      continue;
    }

    // Insert as `pending` so approval runs through the same moderation path a
    // real seller's listing does.
    const { data, error } = await db
      .from('properties')
      .insert({ ...listing, status: 'pending' })
      .select('id')
      .single();
    if (error) throw new Error(`insert listing: ${error.message}`);

    const amenities = [
      ...(listing.property_type !== 'residential_plot' ? SHARED_AMENITIES : []),
      ...((listing.bedrooms ?? 0) >= 3 ? LARGE_HOME_AMENITIES : []),
    ];
    if (amenities.length) {
      const { error: amenityError } = await db
        .from('property_amenities')
        .insert(amenities.map((amenity_name) => ({ property_id: data.id, amenity_name })));
      if (amenityError) throw new Error(`insert amenities: ${amenityError.message}`);
    }

    step(`created listing "${listing.title.slice(0, 45)}…"`);
    created.push({ id: data.id, featured });
  }

  return created;
}

async function approveAll(created) {
  for (const { id, featured } of created) {
    const { data, error } = await db.rpc('admin_approve_property', { p_property_id: id });
    if (error) throw new Error(`approve: ${error.message}`);

    // `not_approvable` simply means it is already published — fine on a re-run.
    if (data?.code === 'published' && featured) {
      await db.from('properties').update({ is_featured: true, verification_status: 'verified' }).eq('id', id);
    }
  }
  step(`approved ${created.length} listings`);
}

// ---------------------------------------------------------------------------
async function main() {
  console.log(`\nSeeding ${url}\n`);

  console.log('Accounts');
  const ids = await ensureAccounts();

  console.log('\nListings');
  const created = await ensureListings(ids);

  console.log('\nModeration');
  await approveAll(created);

  const { count } = await db
    .from('properties')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'published');

  console.log(`\nDone. ${count} published listings.`);
  console.log(`Demo sign-in password (email provider): ${DEMO_PASSWORD}`);
  console.log('  ^ shown once. Set DEMO_PASSWORD to pin it across runs.');
  console.log(
    'Demo accounts use @99estate.dev addresses and one is an ADMIN —\n' +
      'delete them before the site is public.\n',
  );
}

main().catch((error) => {
  console.error(`\nSeed failed: ${error.message}\n`);
  process.exit(1);
});
