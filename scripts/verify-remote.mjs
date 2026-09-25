/**
 * Verifies the 99Estate business rules against a hosted Supabase project,
 * over HTTPS, as a real signed-in user.
 *
 * `supabase/tests/business_rules.sql` proves the rules inside Postgres. This
 * script proves the layer above it: that PostgREST, RLS and the JWT plumbing
 * actually enforce them for a client holding an anon key — which is the only
 * thing an attacker ever holds.
 *
 * It creates one throwaway account, exercises the quota, and deletes the
 * account afterwards (cascading its unlocks and leads away).
 *
 *   node --env-file=.env.local scripts/verify-remote.mjs
 */

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  console.error('Missing Supabase environment variables.');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let passed = 0;
const failures = [];

function check(label, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function main() {
  console.log(`\nVerifying ${url}\n`);

  // --- Fixtures ------------------------------------------------------------
  const { data: properties, error: propError } = await admin
    .from('properties')
    .select('id, title, seller_id, price')
    .eq('status', 'published')
    .order('price')
    .limit(4);

  if (propError) throw new Error(`fetch properties: ${propError.message}`);
  if (!properties || properties.length < 3) {
    throw new Error(`need at least 3 published listings to test the quota, found ${properties?.length ?? 0}`);
  }

  const stamp = process.hrtime.bigint().toString(36);
  const email = `verify.${stamp}@99estate.dev`;
  const password = `Verify!${stamp}`;

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'Verification Buyer' },
  });
  if (createError) throw new Error(`create test user: ${createError.message}`);
  const testUserId = created.user.id;

  try {
    // A reachable buyer is required before any unlock (§2).
    await admin.from('profiles').update({ mobile_number: '9000000199' }).eq('id', testUserId);

    // --- Sign in as that user, holding only the anon key -------------------
    const user = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: signInError } = await user.auth.signInWithPassword({ email, password });
    if (signInError) throw new Error(`sign in: ${signInError.message}`);

    // --- Rule 4: two free unlocks per IST day ------------------------------
    const usage = await user.rpc('get_daily_contact_usage');
    const quota = usage.data?.[0];
    check('fresh account starts with 2 free unlocks', quota?.free_limit === 2 && quota?.free_remaining === 2,
      JSON.stringify(quota));

    // Rule 10: the window is an IST calendar day.
    const resetsAt = quota?.resets_at ? new Date(quota.resets_at) : null;
    const istMidnight = resetsAt
      ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }).format(resetsAt)
      : null;
    check('quota resets at 00:00 IST', istMidnight === '00:00', String(istMidnight));

    // --- First unlock is free and reveals the contact ----------------------
    const first = (await user.rpc('request_contact_unlock', { p_property_id: properties[0].id })).data;
    check('first unlock is free', first?.code === 'unlocked_free', first?.code);
    check('unlock reveals the seller mobile', typeof first?.seller_mobile === 'string' && first.seller_mobile.length === 10,
      String(first?.seller_mobile));
    check('free_remaining drops to 1', first?.free_remaining === 1, String(first?.free_remaining));

    // --- Rule 6: never charged twice for the same listing ------------------
    const repeat = (await user.rpc('request_contact_unlock', { p_property_id: properties[0].id })).data;
    const afterRepeat = (await user.rpc('get_daily_contact_usage')).data?.[0];
    check('re-unlocking the same listing is idempotent', repeat?.code === 'already_unlocked', repeat?.code);
    check('re-unlock does not spend another free credit', afterRepeat?.free_remaining === 1,
      String(afterRepeat?.free_remaining));

    // --- Second free, third must pay ---------------------------------------
    const second = (await user.rpc('request_contact_unlock', { p_property_id: properties[1].id })).data;
    check('second unlock is free', second?.code === 'unlocked_free', second?.code);

    const third = (await user.rpc('request_contact_unlock', { p_property_id: properties[2].id })).data;
    check('third unlock requires payment', third?.code === 'payment_required', third?.code);
    check('server prices the paid unlock at ₹9', Number(third?.amount) === 9, String(third?.amount));

    // --- Rule 7: unlocks cannot be forged ----------------------------------
    const forgeUnlock = await user.from('contact_unlocks').insert({
      user_id: testUserId,
      property_id: properties[2].id,
      seller_id: properties[2].seller_id,
      amount: 0,
      is_free: true,
      payment_status: 'success',
    });
    check('client cannot forge a contact unlock', forgeUnlock.error !== null, forgeUnlock.error?.code);

    const forgeLead = await user.from('leads').insert({
      property_id: properties[2].id,
      seller_id: properties[2].seller_id,
      buyer_id: testUserId,
      contact_unlock_id: properties[2].id,
    });
    check('client cannot forge a lead', forgeLead.error !== null, forgeLead.error?.code);

    const forgePayment = await user.from('payments').insert({
      user_id: testUserId,
      amount: 1,
      currency: 'INR',
      provider: 'fake',
      status: 'success',
    });
    check('client cannot write a payment record', forgePayment.error !== null, forgePayment.error?.code);

    // --- Privilege escalation ----------------------------------------------
    const escalate = await user.from('profiles').update({ role: 'admin' }).eq('id', testUserId);
    const roleNow = (await user.from('profiles').select('role').eq('id', testUserId).maybeSingle()).data?.role;
    check('user cannot promote themselves to admin', escalate.error !== null || roleNow !== 'admin',
      `error=${escalate.error?.code} role=${roleNow}`);

    // --- Rule 8: seller contact privacy ------------------------------------
    const otherProfile = await user.from('profiles').select('mobile_number').eq('id', properties[2].seller_id);
    check('cannot read another user profile row', (otherProfile.data ?? []).length === 0,
      `rows=${otherProfile.data?.length}`);

    const publicSeller = await user
      .from('seller_public_profiles')
      .select('*')
      .eq('id', properties[2].seller_id)
      .maybeSingle();
    const publicCols = Object.keys(publicSeller.data ?? {});
    check('public seller view exposes no contact column',
      publicCols.length > 0 && !publicCols.some((c) => /mobile|phone|email/i.test(c)),
      publicCols.join(','));

    const unlocked = await user.from('unlocked_seller_contacts').select('seller_mobile, property_id');
    check('unlocked view returns exactly the 2 settled unlocks', (unlocked.data ?? []).length === 2,
      `rows=${unlocked.data?.length}`);
    check('unlocked view carries the seller mobile',
      typeof unlocked.data?.[0]?.seller_mobile === 'string');

    // The listing NOT unlocked must not appear there.
    const leakedThird = (unlocked.data ?? []).some((r) => r.property_id === properties[2].id);
    check('un-unlocked listing is absent from the unlocked view', !leakedThird);

    // --- Rule 9: leads created ---------------------------------------------
    const { count: leadCount } = await admin
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('buyer_id', testUserId);
    check('each settled unlock created a lead', leadCount === 2, `leads=${leadCount}`);

    // --- §7: paid settlement is idempotent under webhook retries -----------
    // Gateways retry. If a replay created a second unlock or a second lead,
    // a buyer would be double-granted and the seller double-counted.
    {
      const { data: order } = await user.rpc('create_contact_unlock_order', {
        p_property_id: properties[2].id,
        p_provider: 'mock',
      });
      check('paid order is created at the server price', Number(order?.amount) === 9, String(order?.amount));

      if (order?.payment_id) {
        const settleOnce = () =>
          admin.rpc('settle_paid_contact_unlock', {
            p_payment_id: order.payment_id,
            p_provider_payment_id: 'verify_replay',
            p_metadata: { source: 'verify-remote' },
          });

        const first = await settleOnce();
        check('first settlement succeeds', first.data?.code === 'settled', first.data?.code);

        const before = await admin
          .from('contact_unlocks')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', testUserId);

        const replay = await settleOnce();
        check('replayed settlement is a no-op', replay.data?.code === 'already_settled', replay.data?.code);

        const after = await admin
          .from('contact_unlocks')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', testUserId);

        check('replay did not create a second unlock', before.count === after.count,
          `${before.count} -> ${after.count}`);

        const { count: payments } = await admin
          .from('payments')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', testUserId)
          .eq('status', 'success');
        check('buyer is charged exactly once', payments === 1, `successful payments=${payments}`);
      }
    }

    // --- Seller declares their own type per listing -------------------------
    //
    // seller_type used to be derived from profiles.role by a trigger, so a
    // seller could not say "I am the owner of this one, an agent on that one".
    // The migration replaced the trigger with a declared column, which means
    // two things now have to hold: the value a seller writes must survive, and
    // it must still be constrained to the three legal values.
    {
      // Only the NOT NULL columns. `area_sqft` is generated from `area` and
      // must not be written, and everything else has a default — keeping the
      // fixture minimal means it does not break when the table grows.
      const listing = {
        seller_id: testUserId,
        title: 'Verification listing',
        property_type: 'apartment',
        listing_type: 'sale',
        price: 5000000,
        city: 'Karur',
      };

      const declared = await user
        .from('properties')
        .insert({ ...listing, seller_type: 'agent' })
        .select('id, seller_type')
        .maybeSingle();

      check(
        'seller can declare a listing as agent while their own role is not',
        declared.data?.seller_type === 'agent',
        declared.error?.message ?? `seller_type=${declared.data?.seller_type}`,
      );

      if (declared.data?.id) {
        // The old trigger fired on update too, so this is where a surviving
        // one would show itself.
        const changed = await user
          .from('properties')
          .update({ seller_type: 'builder' })
          .eq('id', declared.data.id)
          .select('seller_type')
          .maybeSingle();

        check(
          'seller can change the declared type afterwards',
          changed.data?.seller_type === 'builder',
          changed.error?.message ?? `seller_type=${changed.data?.seller_type}`,
        );

        const bogus = await user
          .from('properties')
          .update({ seller_type: 'landlord' })
          .eq('id', declared.data.id)
          .select('seller_type')
          .maybeSingle();

        check(
          'an unrecognised seller type is rejected',
          bogus.error !== null && bogus.data?.seller_type !== 'landlord',
          bogus.error ? bogus.error.code : `accepted seller_type=${bogus.data?.seller_type}`,
        );

        await admin.from('properties').delete().eq('id', declared.data.id);
      }
    }

    // --- Anonymous access ---------------------------------------------------
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    const anonProps = await anon.from('properties').select('id').eq('status', 'published').limit(5);
    check('anonymous visitors can browse published listings', (anonProps.data ?? []).length > 0,
      `rows=${anonProps.data?.length}`);

    const anonProfiles = await anon.from('profiles').select('mobile_number').limit(5);
    check('anonymous visitors cannot read profiles', (anonProfiles.data ?? []).length === 0,
      `rows=${anonProfiles.data?.length}`);

    const anonUnlock = await anon.rpc('request_contact_unlock', { p_property_id: properties[0].id });
    check('anonymous unlock attempt is refused', anonUnlock.data?.code === 'unauthenticated',
      anonUnlock.data?.code ?? anonUnlock.error?.code);

    await user.auth.signOut();
  } finally {
    // Cascades the test user's unlocks and leads away with them.
    await admin.auth.admin.deleteUser(testUserId);
    console.log('\n  (cleaned up the throwaway verification account)');
  }

  console.log(`\n${passed} passed, ${failures.length} failed\n`);
  if (failures.length) {
    failures.forEach((f) => console.log(`  FAILED: ${f}`));
    process.exit(1);
  }
  console.log('All business rules hold on the hosted project.\n');
}

main().catch((error) => {
  console.error(`\nVerification failed: ${error.message}\n`);
  process.exit(1);
});
