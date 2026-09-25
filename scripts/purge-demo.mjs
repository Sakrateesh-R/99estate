/**
 * Removes the seeded demo accounts and everything they own.
 *
 * `seed-remote.mjs` creates four `@99estate.dev` accounts — one of them an
 * admin — and six listings. That is fine on an empty project and wrong on a
 * live one: the admin is a real privileged login with a known email, and the
 * listings are fake inventory sitting in public search results.
 *
 * Deleting the auth user cascades profiles, properties, images, unlocks and
 * leads. Storage does not cascade, so the image objects are removed first —
 * otherwise the rows pointing at them vanish and the files stay in the bucket
 * with nothing left to identify them by.
 *
 * Dry by default. Nothing is deleted without --confirm.
 *
 *   node --env-file=.env.local scripts/purge-demo.mjs
 *   node --env-file=.env.local scripts/purge-demo.mjs --confirm
 */

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

/** The seed script's domain. Anything else is somebody's real account. */
const DEMO_DOMAIN = '@99estate.dev';
const BUCKET = 'property-images';

const confirm = process.argv.includes('--confirm');

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const {
  data: { users },
  error: listError,
} = await admin.auth.admin.listUsers({ perPage: 1000 });
if (listError) {
  console.error(`Could not list users: ${listError.message}`);
  process.exit(1);
}

const demoUsers = users.filter((u) => (u.email ?? '').toLowerCase().endsWith(DEMO_DOMAIN));
const realUsers = users.filter((u) => !(u.email ?? '').toLowerCase().endsWith(DEMO_DOMAIN));

if (demoUsers.length === 0) {
  console.log(`\nNo ${DEMO_DOMAIN} accounts found — nothing to purge.\n`);
  process.exit(0);
}

const demoIds = demoUsers.map((u) => u.id);

const { data: properties } = await admin
  .from('properties')
  .select('id, title, city, status, seller_id')
  .in('seller_id', demoIds);

const propertyIds = (properties ?? []).map((p) => p.id);

const { data: images } = propertyIds.length
  ? await admin.from('property_images').select('storage_path').in('property_id', propertyIds)
  : { data: [] };

const storagePaths = (images ?? []).map((i) => i.storage_path).filter(Boolean);

/**
 * Listings owned by a real account are never touched, even if the seed put
 * them there. Reporting the number is what makes that checkable rather than
 * merely claimed.
 */
const { count: survivingListings } = await admin
  .from('properties')
  .select('*', { count: 'exact', head: true })
  .not('seller_id', 'in', `(${demoIds.join(',')})`);

console.log(`\n${confirm ? 'PURGING' : 'DRY RUN — nothing will be deleted'}\n`);

console.log(`Accounts to delete (${demoUsers.length}):`);
for (const u of demoUsers) {
  const owned = (properties ?? []).filter((p) => p.seller_id === u.id).length;
  console.log(`  ${u.email}  listings=${owned}`);
}

console.log(`\nListings to delete (${propertyIds.length}):`);
for (const p of properties ?? []) {
  console.log(`  ${p.status.padEnd(9)} ${p.city.padEnd(12)} ${p.title.slice(0, 54)}`);
}

console.log(`\nStorage objects to delete: ${storagePaths.length}`);

console.log(`\nUntouched:`);
console.log(`  real accounts   ${realUsers.length}`);
for (const u of realUsers) console.log(`    ${u.email}`);
console.log(`  their listings  ${survivingListings ?? 0}`);

if (!confirm) {
  console.log(`\nRe-run with --confirm to delete.\n`);
  process.exit(0);
}

// --- Storage first: it does not cascade, and the rows naming these paths are
// about to disappear.
if (storagePaths.length) {
  const { error } = await admin.storage.from(BUCKET).remove(storagePaths);
  if (error) {
    console.error(`\nStorage delete failed: ${error.message}`);
    console.error('Stopping before deleting accounts, so the paths remain recoverable.\n');
    process.exit(1);
  }
  console.log(`\n  removed ${storagePaths.length} storage objects`);
}

for (const u of demoUsers) {
  const { error } = await admin.auth.admin.deleteUser(u.id);
  if (error) console.error(`  FAILED ${u.email}: ${error.message}`);
  else console.log(`  deleted ${u.email}`);
}

// --- Verify rather than assume -------------------------------------------
const {
  data: { users: after },
} = await admin.auth.admin.listUsers({ perPage: 1000 });
const remainingDemo = after.filter((u) => (u.email ?? '').toLowerCase().endsWith(DEMO_DOMAIN));

const { count: remainingProps } = await admin
  .from('properties')
  .select('*', { count: 'exact', head: true });
const { count: remainingImages } = await admin
  .from('property_images')
  .select('*', { count: 'exact', head: true });

console.log(`\nAfter:`);
console.log(`  ${DEMO_DOMAIN} accounts  ${remainingDemo.length}`);
console.log(`  accounts total      ${after.length}`);
console.log(`  properties          ${remainingProps}`);
console.log(`  property_images     ${remainingImages}`);

if (remainingDemo.length > 0) {
  console.error('\nSome demo accounts survived.\n');
  process.exit(1);
}
console.log('\nDemo data removed.\n');
