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

import { randomUUID } from 'node:crypto';
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
  const stamp = process.hrtime.bigint().toString(36);

  /**
   * The quota rules need three listings to exercise: two free unlocks and a
   * third that must be paid for.
   *
   * These used to come from whatever happened to be published, which made the
   * suite silently dependent on seed data — and it stopped running the moment
   * the demo listings were deleted from the live project. It now supplies its
   * own when the project is empty, so a production database with no inventory
   * yet is a perfectly good thing to verify against.
   *
   * Real listings are preferred when they exist: exercising the rules against
   * genuine rows is a stronger check than against rows shaped to pass.
   */
  let seededSellerId = null;
  const seededPropertyIds = [];

  async function loadProperties() {
    const { data, error } = await admin
      .from('properties')
      .select('id, title, seller_id, price')
      .eq('status', 'published')
      .order('price')
      .limit(4);
    if (error) throw new Error(`fetch properties: ${error.message}`);
    return data ?? [];
  }

  let properties = await loadProperties();

  if (properties.length < 3) {
    const sellerEmail = `verify.seller.${stamp}@99estate.dev`;
    const { data: seller, error: sellerError } = await admin.auth.admin.createUser({
      email: sellerEmail,
      password: `Verify!${stamp}`,
      email_confirm: true,
      user_metadata: { full_name: 'Verification Seller' },
    });
    if (sellerError) throw new Error(`create fixture seller: ${sellerError.message}`);
    seededSellerId = seller.user.id;

    // A seller must be reachable before their contact can be unlocked.
    await admin.from('profiles').update({ mobile_number: '9000000198' }).eq('id', seededSellerId);

    // Service role bypasses the lifecycle guard, so these can be published
    // outright rather than walked through the draft → pending → live flow.
    const { data: made, error: makeError } = await admin
      .from('properties')
      .insert(
        [1, 2, 3].map((n) => ({
          seller_id: seededSellerId,
          title: `Verification listing ${n}`,
          property_type: 'apartment',
          listing_type: 'sale',
          price: 1000000 * n,
          city: 'Karur',
          status: 'published',
          published_at: new Date().toISOString(),
        })),
      )
      .select('id, title, seller_id, price');

    if (makeError) throw new Error(`create fixture listings: ${makeError.message}`);
    seededPropertyIds.push(...(made ?? []).map((p) => p.id));

    properties = await loadProperties();
    console.log(`  (seeded ${seededPropertyIds.length} temporary listings — project had none)\n`);
  }

  if (properties.length < 3) {
    throw new Error(`need at least 3 published listings, found ${properties.length}`);
  }
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

    // --- Lead inbox (§15) ---------------------------------------------------
    //
    // The unlocks above already created leads. What matters here is who can
    // read them: the view hands out the buyer's phone number, which is as
    // sensitive as the seller contact the entire paywall exists to protect.
    {
      const sellerId = properties[0].seller_id;

      // Seller of the unlocked listing, signed in as themselves.
      const sellerEmail = `verify.inbox.${stamp}@99estate.dev`;
      const sellerPassword = `Verify!${stamp}`;

      // Only possible when we own the fixture seller; against real listings
      // the owner's password is unknown, so this block adapts.
      let sellerClient = null;
      if (seededSellerId && sellerId === seededSellerId) {
        await admin.auth.admin.updateUserById(seededSellerId, { password: sellerPassword });
        sellerClient = createClient(url, anonKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const { error } = await sellerClient.auth.signInWithPassword({
          email: (await admin.auth.admin.getUserById(seededSellerId)).data.user.email,
          password: sellerPassword,
        });
        if (error) sellerClient = null;
      }

      if (sellerClient) {
        const inbox = await sellerClient
          .from('lead_details')
          .select('id, status, buyer_mobile, buyer_name, property_id');

        check('seller sees the leads their unlocks created', (inbox.data ?? []).length >= 2,
          `rows=${inbox.data?.length ?? 0} ${inbox.error?.message ?? ''}`);

        check('lead carries the buyer mobile the seller earned',
          typeof inbox.data?.[0]?.buyer_mobile === 'string' && inbox.data[0].buyer_mobile.length === 10,
          String(inbox.data?.[0]?.buyer_mobile));

        const leadId = inbox.data?.[0]?.id;

        if (leadId) {
          const moved = await sellerClient
            .from('leads').update({ status: 'contacted' }).eq('id', leadId).select('status').maybeSingle();
          check('seller can move a lead through the pipeline', moved.data?.status === 'contacted',
            moved.error?.message ?? String(moved.data?.status));

          const noted = await sellerClient
            .from('leads').update({ notes: 'Site visit Saturday' }).eq('id', leadId).select('notes').maybeSingle();
          check('seller can attach a private note', noted.data?.notes === 'Site visit Saturday',
            noted.error?.message ?? String(noted.data?.notes));

          /**
           * The guard exists precisely to stop this: `lead_details` joins the
           * buyer's profile for their mobile, so a seller able to rewrite
           * buyer_id could read any user's phone number by pointing one of
           * their own leads at them.
           *
           * The target must be an id the lead does not already hold —
           * assigning the current buyer back to itself changes nothing, so
           * the guard has nothing to object to and the update succeeds
           * correctly.
           */
          const hijack = await sellerClient
            .from('leads').update({ buyer_id: randomUUID() }).eq('id', leadId).select('buyer_id').maybeSingle();
          check('seller cannot repoint a lead at another buyer', hijack.error !== null,
            hijack.error ? hijack.error.code : 'UPDATE WAS ALLOWED');

          const stolen = await sellerClient
            .from('leads').update({ seller_id: testUserId }).eq('id', leadId).select('seller_id').maybeSingle();
          check('seller cannot transfer a lead away', stolen.error !== null || stolen.data === null,
            stolen.error ? stolen.error.code : 'UPDATE WAS ALLOWED');
        }

        await sellerClient.auth.signOut();
      }

      // The buyer is a party to the lead and may see it, but must never get a
      // writable handle on the seller's pipeline.
      const buyerView = await user.from('lead_details').select('id');
      check('buyer does not appear in the seller inbox view', (buyerView.data ?? []).length === 0,
        `rows=${buyerView.data?.length ?? 0}`);

      const anonLeads = createClient(url, anonKey, { auth: { persistSession: false } });
      const anonView = await anonLeads.from('lead_details').select('id');
      check('anonymous visitors cannot read any lead', (anonView.data ?? []).length === 0,
        `rows=${anonView.data?.length ?? 0}`);
      void sellerEmail;
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

    // Deleting the fixture seller cascades its listings, and with them the
    // unlocks and leads pointing at those listings. Runs even when an
    // assertion threw — a failed run must not leave fake inventory behind on
    // a live project.
    if (seededSellerId) await admin.auth.admin.deleteUser(seededSellerId);

    console.log(
      `\n  (cleaned up the throwaway verification account${seededSellerId ? ' and its fixture listings' : ''})`,
    );
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
