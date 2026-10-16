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

  /**
   * The builder/promoter fixtures, declared out here so the cleanup in the
   * `finally` can reach them. `organizations.created_by` is ON DELETE SET NULL,
   * so deleting the builder account would leave the company and its published
   * projects standing on a live database — the organization has to be removed
   * explicitly, and its cascade takes the projects, inventory and leads.
   */
  let builderUserId = null;
  const createdOrgIds = [];

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

    // --- §19: a notification is the platform's word, not the reader's -------
    {
      /**
       * Inserted with the service role, because that is the only way this
       * table is ever written: `create_notification` is SECURITY DEFINER and
       * revoked from `authenticated`, and there is no insert policy at all.
       */
      const fixture = await admin
        .from('notifications')
        .insert({
          user_id: testUserId,
          title: 'Verification notice',
          message: 'Created by the verification suite.',
          type: 'system',
          link: '/dashboard',
        })
        .select('id')
        .maybeSingle();
      if (fixture.error) throw new Error(`create notification fixture: ${fixture.error.message}`);
      const notificationId = fixture.data.id;

      const own = await user.from('notifications').select('id, user_id, is_read');
      check(
        'recipient can read their own notifications',
        (own.data ?? []).some((n) => n.id === notificationId),
        own.error?.message ?? `rows=${own.data?.length ?? 0}`,
      );
      check(
        "recipient sees nobody else's notifications",
        (own.data ?? []).every((n) => n.user_id === testUserId),
        `rows=${own.data?.length ?? 0}`,
      );

      const read = await user
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId)
        .select('is_read')
        .maybeSingle();
      check('recipient can mark a notification read', read.data?.is_read === true,
        read.error?.message ?? String(read.data?.is_read));

      /**
       * `notifications_guard_write` copies every field but `is_read` back from
       * the old row, so this update is allowed to run and simply changes
       * nothing. It matters: a recipient who could rewrite "Listing needs
       * changes" into "Payment successful" would hold a screenshot worth
       * showing somebody.
       */
      const rewritten = await user
        .from('notifications')
        .update({ title: 'Payment successful', message: 'Forged', link: '/', type: 'payment' })
        .eq('id', notificationId)
        .select('title, message, link, type')
        .maybeSingle();
      check(
        'recipient cannot rewrite what a notification says',
        rewritten.data?.title === 'Verification notice' &&
          rewritten.data?.message === 'Created by the verification suite.' &&
          rewritten.data?.link === '/dashboard' &&
          rewritten.data?.type === 'system',
        rewritten.error?.message ?? JSON.stringify(rewritten.data),
      );

      const forged = await user
        .from('notifications')
        .insert({ user_id: testUserId, title: 'You have been paid', type: 'payment' })
        .select('id');
      check('recipient cannot create a notification', forged.error !== null,
        forged.error ? forged.error.code : 'INSERT WAS ALLOWED');

      const anonNotifications = createClient(url, anonKey, { auth: { persistSession: false } });
      const anonRead = await anonNotifications.from('notifications').select('id').limit(5);
      check('anonymous visitors cannot read notifications', (anonRead.data ?? []).length === 0,
        `rows=${anonRead.data?.length ?? 0}`);

      // Their own copy, so dismissing it is theirs to do.
      const removed = await user
        .from('notifications')
        .delete()
        .eq('id', notificationId)
        .select('id')
        .maybeSingle();
      check('recipient can dismiss a notification', removed.data?.id === notificationId,
        removed.error?.message ?? String(removed.data?.id));
    }

    // --- §18: the lifecycle sweep is not a public button --------------------
    {
      /**
       * Both are granted to `authenticated` so the admin console can call them
       * with the signed-in admin's own client, and both re-check `is_admin()`
       * internally. An ordinary user reaching them would be able to expire
       * other people's listings and spray notifications at every seller.
       */
      const sweep = await user.rpc('expire_stale_properties');
      check('ordinary user cannot run the expiry sweep', sweep.error?.code === '42501',
        sweep.error ? sweep.error.code : 'SWEEP WAS ALLOWED');

      const warn = await user.rpc('notify_expiring_properties', { p_days_ahead: 7 });
      check('ordinary user cannot send expiry warnings', warn.error?.code === '42501',
        warn.error ? warn.error.code : 'WARNINGS WERE ALLOWED');

      // The service role is how the scheduled route runs it, so that path has
      // to work — and it must be safe to run when nothing is due.
      const asService = await admin.rpc('expire_stale_properties');
      check('service role can run the expiry sweep', asService.error === null && typeof asService.data === 'number',
        asService.error?.message ?? `returned ${JSON.stringify(asService.data)}`);

      const repeat = await admin.rpc('expire_stale_properties');
      check('re-running the sweep expires nothing further', repeat.data === 0,
        repeat.error?.message ?? String(repeat.data));

      /**
       * The console's "Run the sweep now" button calls these with the admin's
       * own client, not the service role, so `is_admin()` has to be enough on
       * its own — otherwise the button is dead on arrival.
       *
       * `is_admin()` reads `profiles`, so promoting through the service role
       * takes effect on the session already open. Demoted immediately, and the
       * account is a throwaway that gets deleted either way.
       */
      const before = await admin
        .from('profiles').select('role').eq('id', testUserId).maybeSingle();
      const priorRole = before.data?.role ?? 'buyer';

      await admin.from('profiles').update({ role: 'admin' }).eq('id', testUserId);
      let asAdmin;
      let asAdminWarn;
      try {
        asAdmin = await user.rpc('expire_stale_properties');
        asAdminWarn = await user.rpc('notify_expiring_properties', { p_days_ahead: 7 });
      } finally {
        // Restored even if an assertion throws: a half-finished run must never
        // leave an extra admin on a live project.
        await admin.from('profiles').update({ role: priorRole }).eq('id', testUserId);
      }

      check('an admin can run the sweep with their own client',
        asAdmin.error === null && typeof asAdmin.data === 'number',
        asAdmin.error?.message ?? `returned ${JSON.stringify(asAdmin.data)}`);
      check('an admin can send expiry warnings with their own client',
        asAdminWarn.error === null && typeof asAdminWarn.data === 'number',
        asAdminWarn.error?.message ?? `returned ${JSON.stringify(asAdminWarn.data)}`);

      // And the demotion actually took, so the fixture cannot leave an admin
      // behind if cleanup is ever skipped.
      const afterDemotion = await user.rpc('expire_stale_properties');
      check('revoking admin closes the sweep again', afterDemotion.error?.code === '42501',
        afterDemotion.error ? afterDemotion.error.code : 'STILL ALLOWED');
    }

    // --- §12: an admin posts on behalf of an owner, agent or builder --------
    //
    // Requires migration 20260926090000_admin_posts_on_behalf.sql. Until that
    // is applied these fail, which is the intended signal rather than a bug.
    {
      const behalfEmail = `behalf.${stamp}@99estate.dev`;
      const { data: owner, error: ownerError } = await admin.auth.admin.createUser({
        email: behalfEmail,
        password: `Behalf!${stamp}`,
        email_confirm: true,
        user_metadata: { full_name: 'On Behalf Owner' },
      });
      if (ownerError) throw new Error(`create on-behalf owner: ${ownerError.message}`);
      const ownerId = owner.user.id;

      const listing = {
        title: 'Listed by the platform on behalf of the owner',
        property_type: 'apartment',
        listing_type: 'sale',
        price: 2500000,
        city: 'Karur',
        status: 'draft',
      };

      const before = await admin
        .from('profiles').select('role').eq('id', testUserId).maybeSingle();
      const priorRole = before.data?.role ?? 'buyer';

      try {
        // --- As an ordinary user, before any promotion ---------------------
        const notMine = await user
          .from('properties')
          .insert({ seller_id: ownerId, ...listing })
          .select('id');
        check('ordinary user cannot post a listing for somebody else', notMine.error !== null,
          notMine.error ? notMine.error.code : 'INSERT WAS ALLOWED');

        /**
         * The pin matters on its own: a seller who could set `posted_by` would
         * be dressing their own listing up as one the platform placed for them,
         * borrowing credibility it has not earned.
         */
        const forged = await user
          .from('properties')
          .insert({ seller_id: testUserId, posted_by: testUserId, ...listing })
          .select('id, posted_by')
          .maybeSingle();
        check('a seller cannot mark their own listing as platform-posted',
          forged.data?.posted_by === null,
          forged.error?.message ?? `posted_by=${forged.data?.posted_by}`);

        const flip = await user
          .from('profiles')
          .update({ is_placeholder: true })
          .eq('id', testUserId)
          .select('is_placeholder')
          .maybeSingle();
        check('a user cannot flip their own placeholder flag', flip.data?.is_placeholder === false,
          flip.error?.message ?? `is_placeholder=${flip.data?.is_placeholder}`);

        // --- As an admin ---------------------------------------------------
        await admin.from('profiles').update({ role: 'admin' }).eq('id', testUserId);
        let unreachable;
        let posted;
        let photoAsAdmin;
        let approvedDraft;
        try {
          /**
           * The owner has a name but no mobile yet, so `profile_is_complete`
           * fails for them. This must be refused: the listing would sell a
           * buyer a ₹9 unlock that discloses nothing.
           */
          unreachable = await user
            .from('properties')
            .insert({ seller_id: ownerId, posted_by: testUserId, ...listing })
            .select('id');

          await admin
            .from('profiles')
            .update({ mobile_number: '9000000197' })
            .eq('id', ownerId);

          posted = await user
            .from('properties')
            .insert({ seller_id: ownerId, posted_by: testUserId, ...listing })
            .select('id, seller_id, posted_by')
            .maybeSingle();

          /**
           * A listing cannot be submitted without three photos, so an admin who
           * can create one but not attach an image to it has been handed half a
           * feature. This was exactly the bug: `property_images_write` allows
           * admins, but the app kept a second private ownership check that did
           * not.
           */
          if (posted.data?.id) {
            photoAsAdmin = await user
              .from('property_images')
              .insert({
                property_id: posted.data.id,
                storage_path: `properties/${posted.data.id}/verify-${stamp}.jpg`,
                public_url: `https://example.invalid/verify-${stamp}.jpg`,
              })
              .select('id')
              .maybeSingle();

            /**
             * The path `submitPropertyForReview` now takes for an admin: publish
             * outright rather than queue for review, since the admin is the
             * reviewer. Goes through the RPC so the 90-day clock, published_at
             * and the seller's notification are all set by the routine that owns
             * those side effects — and it has to accept a `draft`, not only a
             * `pending` listing.
             */
            approvedDraft = await user.rpc('admin_approve_property', {
              p_property_id: posted.data.id,
            });
          }
        } finally {
          await admin.from('profiles').update({ role: priorRole }).eq('id', testUserId);
        }

        check('admin cannot post for a seller with no reachable number', unreachable.error !== null,
          unreachable.error ? unreachable.error.code : 'INSERT WAS ALLOWED');
        check('admin can post a listing on a seller\'s behalf', posted.data?.seller_id === ownerId,
          posted.error?.message ?? JSON.stringify(posted.data));
        check('the listing records which admin posted it', posted.data?.posted_by === testUserId,
          posted.error?.message ?? `posted_by=${posted.data?.posted_by}`);

        check('an admin can attach a photo to a listing they posted',
          photoAsAdmin?.error === null && Boolean(photoAsAdmin?.data?.id),
          photoAsAdmin?.error?.message ?? 'no row returned');

        // And the allowance really is admin-only: the same insert from an
        // ordinary user, now demoted, must be refused.
        const photoAsUser = await user
          .from('property_images')
          .insert({
            property_id: posted.data?.id,
            storage_path: `properties/${posted.data?.id}/intruder-${stamp}.jpg`,
            public_url: `https://example.invalid/intruder-${stamp}.jpg`,
          })
          .select('id');
        check('an ordinary user cannot attach a photo to a listing that is not theirs',
          photoAsUser.error !== null,
          photoAsUser.error ? photoAsUser.error.code : 'INSERT WAS ALLOWED');

        // --- An admin's submission publishes outright ------------------------
        check('an admin can publish a draft without a review queue',
          approvedDraft?.data?.ok === true && approvedDraft?.data?.code === 'published',
          approvedDraft?.error?.message ?? JSON.stringify(approvedDraft?.data));

        const live = await admin
          .from('properties')
          .select('seller_id, status, published_at, expires_at')
          .eq('id', posted.data?.id)
          .maybeSingle();

        check('publishing sets the 90-day clock and keeps the seller as owner',
          live.data?.status === 'published' &&
            live.data?.seller_id === ownerId &&
            Boolean(live.data?.published_at) &&
            new Date(live.data?.expires_at).getTime() > Date.now(),
          JSON.stringify(live.data));

        // The seller finds out, which is the whole reason to go through the RPC
        // rather than an UPDATE — and matters most for a seller who was posted
        // on behalf of and is hearing about their own listing for the first time.
        const told = await admin
          .from('notifications')
          .select('type, data')
          .eq('user_id', ownerId)
          .eq('type', 'property_approved');
        check('the seller is told their listing went live',
          (told.data ?? []).some((n) => n.data?.property_id === posted.data?.id),
          `rows=${told.data?.length ?? 0}`);
      } finally {
        // Cascades the on-behalf listing away with its owner.
        await admin.auth.admin.deleteUser(ownerId);
        await admin.from('profiles').update({ role: priorRole }).eq('id', testUserId);
      }
    }

    // --- §12: a seller publishes without waiting for anybody ----------------
    //
    // Requires migration 20260927090000_publish_without_review.sql. This is the
    // rule that changed, so it is the one worth holding down: the app now sets
    // `status = 'published'` directly, and if the guard still refused the
    // transition every seller would hit a 42501 at the last step of the wizard.
    {
      const draft = await user
        .from('properties')
        .insert({
          seller_id: testUserId,
          title: 'Self-published verification listing',
          property_type: 'apartment',
          listing_type: 'sale',
          price: 3300000,
          city: 'Karur',
          status: 'draft',
        })
        .select('id, status')
        .maybeSingle();

      check('a seller can create their own draft', draft.data?.status === 'draft',
        draft.error?.message ?? String(draft.data?.status));

      const published = await user
        .from('properties')
        .update({ status: 'published' })
        .eq('id', draft.data?.id)
        .select('status, published_at, expires_at')
        .maybeSingle();

      check('a seller can publish it with no review queue',
        published.data?.status === 'published',
        published.error?.message ?? String(published.data?.status));

      // The publication bookkeeping still runs for a self-published listing, so
      // it joins the 90-day expiry cycle exactly like an approved one used to.
      check('publishing still stamps the 90-day clock',
        Boolean(published.data?.published_at) &&
          new Date(published.data?.expires_at).getTime() > Date.now(),
        JSON.stringify(published.data));

      /**
       * A material edit used to demote a live listing to `pending` to force
       * re-approval. With no queue that would have taken it out of search with
       * nothing able to put it back, so it must now stay published.
       */
      const edited = await user
        .from('properties')
        .update({ title: 'Self-published verification listing, edited', price: 3400000 })
        .eq('id', draft.data?.id)
        .select('status, title')
        .maybeSingle();

      check('editing a live listing leaves it live',
        edited.data?.status === 'published',
        edited.error?.message ?? `status=${edited.data?.status}`);

      // The seller still owns only their own listings: publishing is now open,
      // writing to somebody else's is not.
      const notMine = await user
        .from('properties')
        .update({ status: 'published' })
        .eq('id', properties[0].id)
        .select('id');
      check('a seller still cannot publish a listing that is not theirs',
        (notMine.data ?? []).length === 0,
        notMine.error ? notMine.error.code : `rows=${notMine.data?.length ?? 0}`);

      await admin.from('properties').delete().eq('id', draft.data?.id);
    }

    // --- §18: renewing a listing actually renews it -------------------------
    //
    // This was never covered, which is how `renew_property` shipped throwing
    // 42804 on every call: its UPDATE set an enum column from a CASE whose
    // branches were both bare literals, so PostgreSQL resolved the expression
    // as text and refused the assignment. Both the seller button and the admin
    // one call this RPC, so neither worked.
    //
    // Requires migration 20261016090000_enum_case_needs_a_cast.sql. Both
    // branches of that CASE are exercised, because a cast applied to one and
    // not the other would look fixed from the dashboard.
    {
      const past = new Date(Date.now() - 100 * 24 * 3600 * 1000).toISOString();

      const base = {
        seller_id: testUserId,
        property_type: 'apartment',
        listing_type: 'sale',
        city: 'Karur',
        status: 'draft',
      };

      // Branch one: previously published, so renewing returns it to market.
      const lived = await user
        .from('properties')
        .insert({ ...base, title: 'Renewal fixture, once live', price: 2100000 })
        .select('id')
        .maybeSingle();
      await user.from('properties').update({ status: 'published' }).eq('id', lived.data?.id);
      await admin
        .from('properties').update({ status: 'expired', expires_at: past }).eq('id', lived.data?.id);

      const renewed = await user.rpc('renew_property', { p_property_id: lived.data?.id });
      check('a seller can renew a listing that was live',
        renewed.data?.ok === true && renewed.data?.code === 'renewed',
        renewed.error ? `${renewed.error.code} ${renewed.error.message}` : JSON.stringify(renewed.data));
      check('renewing a previously published listing puts it back on the market',
        renewed.data?.status === 'published',
        renewed.error?.code ?? String(renewed.data?.status));

      const clock = await admin
        .from('properties')
        .select('expires_at, last_renewed_at')
        .eq('id', lived.data?.id)
        .maybeSingle();
      check('renewing restarts the 90-day clock',
        Boolean(clock.data?.last_renewed_at) &&
          new Date(clock.data?.expires_at).getTime() > Date.now(),
        JSON.stringify(clock.data));

      // Branch two: never published, so it has to pass moderation instead.
      const unseen = await user
        .from('properties')
        .insert({ ...base, title: 'Renewal fixture, never live', price: 2200000 })
        .select('id')
        .maybeSingle();
      await admin
        .from('properties')
        .update({ status: 'expired', expires_at: past, published_at: null })
        .eq('id', unseen.data?.id);

      const requeued = await user.rpc('renew_property', { p_property_id: unseen.data?.id });
      check('renewing a listing that was never live sends it to moderation',
        requeued.data?.ok === true && requeued.data?.status === 'pending',
        requeued.error ? `${requeued.error.code} ${requeued.error.message}` : JSON.stringify(requeued.data));

      const notMine = await user.rpc('renew_property', { p_property_id: properties[0].id });
      check('a seller cannot renew a listing that is not theirs',
        notMine.error?.code === '42501',
        notMine.error ? notMine.error.code : JSON.stringify(notMine.data));

      await admin.from('properties').delete().in('id', [lived.data?.id, unseen.data?.id]);
    }

    // --- §12: the video link cannot be an arbitrary URL ---------------------
    //
    // Requires migration 20260926100000_property_video_tour.sql. The app
    // canonicalises before writing (scripts/verify-video-urls.mts covers that
    // parser); this checks the constraint that holds when something writes
    // around the app, because the value lands in an `<iframe src>`.
    {
      const base = {
        seller_id: testUserId,
        title: 'Video constraint fixture listing',
        property_type: 'apartment',
        listing_type: 'sale',
        price: 1500000,
        city: 'Karur',
        status: 'draft',
      };

      const good = await user
        .from('properties')
        .insert({ ...base, video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })
        .select('id, video_url')
        .maybeSingle();
      check('a canonical YouTube link is accepted',
        good.data?.video_url === 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        good.error?.message ?? String(good.data?.video_url));

      const vimeo = await user
        .from('properties')
        .insert({ ...base, video_url: 'https://vimeo.com/123456789' })
        .select('video_url')
        .maybeSingle();
      check('a canonical Vimeo link is accepted', vimeo.data?.video_url === 'https://vimeo.com/123456789',
        vimeo.error?.message ?? String(vimeo.data?.video_url));

      /**
       * Each of these would be an iframe pointing somewhere we did not choose.
       * The service role is used deliberately — it bypasses RLS, so a failure
       * here is the CHECK constraint refusing and nothing else.
       */
      const hostile = [
        ['an unrelated host', 'https://evil.com/video'],
        ['a look-alike host', 'https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ'],
        ['credentials in the authority', 'https://www.youtube.com@evil.com/watch?v=dQw4w9WgXcQ'],
        ['a javascript: URL', 'javascript:alert(1)'],
        ['a data: URL', 'data:text/html,<script>alert(1)</script>'],
        ['a trailing query string', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&next=https://evil.com'],
        ['a plain http scheme', 'http://www.youtube.com/watch?v=dQw4w9WgXcQ'],
        ['a channel page', 'https://www.youtube.com/@somecreator'],
      ];

      for (const [label, value] of hostile) {
        const attempt = await admin
          .from('properties')
          .insert({ ...base, video_url: value })
          .select('id');
        check(`the database rejects ${label} as a video link`, attempt.error !== null,
          attempt.error ? attempt.error.code : 'INSERT WAS ALLOWED');
      }
    }

    // --- §2–§29: organizations, projects, inventory and project leads -------
    //
    // Requires migrations 20261007090000 and 20261007090100. Every assertion
    // here is a rule the database is meant to hold on its own, exercised by a
    // client holding nothing but the anon key.
    //
    // The shape of the fixture matters: the builder account and the buyer
    // account are different people, because a member enquiring about their own
    // project is a case the RPC refuses by design — so a single account could
    // not exercise both sides.
    {
      const probe = await admin.from('organizations').select('id').limit(1);

      if (probe.error) {
        check('migrations 029/030 are applied', false, probe.error.message);
      } else {
        const builderEmail = `verify.builder.${stamp}@99estate.dev`;
        const builderPassword = `Verify!${stamp}`;
        const { data: builderAccount, error: builderError } = await admin.auth.admin.createUser({
          email: builderEmail,
          password: builderPassword,
          email_confirm: true,
          user_metadata: { full_name: 'Verification Builder' },
        });
        if (builderError) throw new Error(`create builder account: ${builderError.message}`);
        builderUserId = builderAccount.user.id;

        // Registering a company is gated on the same complete profile that
        // posting a listing is.
        await admin.from('profiles').update({ mobile_number: '9000000196' }).eq('id', builderUserId);

        const builder = createClient(url, anonKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const { error: builderSignIn } = await builder.auth.signInWithPassword({
          email: builderEmail,
          password: builderPassword,
        });
        if (builderSignIn) throw new Error(`sign in as builder: ${builderSignIn.message}`);

        const anonProjects = createClient(url, anonKey, { auth: { persistSession: false } });

        // --- §2: onboarding, and the pins on it ----------------------------
        //
        // The three admin-managed values are passed deliberately. They are
        // absent from the Insert type in types/database.types.ts, but a type is
        // a promise to the app and not a defence — what has to hold is that the
        // database flattens them when something writes around it.
        const org = await builder
          .from('organizations')
          .insert({
            name: `Verification Builders ${stamp}`,
            org_types: ['builder', 'developer', 'promoter'],
            city: 'Karur',
            phone: '9000000196',
            verification_status: 'verified',
            projects_count: 99,
          })
          .select('id, slug, created_by, verification_status, is_verified, projects_count')
          .maybeSingle();

        check('a complete profile can register a company', Boolean(org.data?.id),
          org.error?.message ?? 'no row returned');
        if (org.data?.id) createdOrgIds.push(org.data.id);

        check('the company is given a URL slug of its own',
          /^[a-z0-9]+(-[a-z0-9]+)*$/.test(String(org.data?.slug)), String(org.data?.slug));
        check('the registrant is recorded as the creator', org.data?.created_by === builderUserId,
          String(org.data?.created_by));

        // §22. A company that can award itself the badge is the one thing the
        // badge must never be able to mean.
        check('a company cannot register itself as verified',
          org.data?.verification_status === 'unverified' && org.data?.is_verified === false,
          `${org.data?.verification_status} is_verified=${org.data?.is_verified}`);
        check('the project counter cannot be seeded by the client', org.data?.projects_count === 0,
          String(org.data?.projects_count));

        // --- §3: the team ---------------------------------------------------
        const membership = await builder
          .from('organization_members')
          .select('id, user_id, role, status')
          .eq('organization_id', org.data?.id);
        check('the registrant becomes the active owner',
          (membership.data ?? []).some(
            (m) => m.user_id === builderUserId && m.role === 'owner' && m.status === 'active',
          ),
          membership.error?.message ?? JSON.stringify(membership.data));

        const selfDemote = await builder
          .from('organization_members')
          .update({ role: 'viewer' })
          .eq('organization_id', org.data?.id)
          .eq('user_id', builderUserId)
          .select('role')
          .maybeSingle();
        check('nobody can change their own role', selfDemote.error !== null,
          selfDemote.error ? selfDemote.error.code : `role=${selfDemote.data?.role}`);

        /**
         * Without this the company is left in the state the seed trigger exists
         * to prevent — unmanageable, with no insert to hang a fix on, and only
         * a platform admin able to recover it.
         */
        const abandon = await builder
          .from('organization_members')
          .delete()
          .eq('organization_id', org.data?.id)
          .eq('user_id', builderUserId)
          .select('id');
        check('a company cannot be left without an active owner', abandon.error !== null,
          abandon.error ? abandon.error.code : 'DELETE WAS ALLOWED');

        const selfVerify = await builder
          .from('organizations')
          .update({ verification_status: 'verified' })
          .eq('id', org.data?.id)
          .select('verification_status')
          .maybeSingle();
        check('an owner cannot verify their own company', selfVerify.error !== null,
          selfVerify.error ? selfVerify.error.code : `status=${selfVerify.data?.verification_status}`);

        const rpcAsOwner = await builder.rpc('admin_verify_organization', {
          p_organization_id: org.data?.id,
          p_status: 'verified',
        });
        check('the verification RPC refuses a non-admin', rpcAsOwner.error?.code === '42501',
          rpcAsOwner.error ? rpcAsOwner.error.code : 'RPC WAS ALLOWED');

        // --- §5: the project record -----------------------------------------
        const project = await builder
          .from('projects')
          .insert({
            organization_id: org.data?.id,
            name: `Green Valley ${stamp}`,
            project_type: 'plot',
            city: 'Karur',
            locality: 'Thanthoni',
            status: 'under_construction',
            total_units: 120,
            price_min: 5500000,
            price_max: 8200000,
            construction_progress_percentage: 40,
            is_featured: true,
            verification_status: 'verified',
            progress_verification: 'admin_verified',
            units_total: 500,
            views_count: 9999,
          })
          .select(
            'id, slug, is_published, is_featured, verification_status, progress_verification, units_total, views_count',
          )
          .maybeSingle();

        check('an owner can create a project', Boolean(project.data?.id),
          project.error?.message ?? 'no row returned');
        check('the project slug folds in the locality and city',
          String(project.data?.slug).includes('thanthoni-karur'), String(project.data?.slug));
        check('a project cannot launch itself featured or verified',
          project.data?.is_featured === false && project.data?.verification_status === 'unverified',
          `featured=${project.data?.is_featured} status=${project.data?.verification_status}`);
        // §8 — the entire reason this is a separate column from the percentage.
        check('reported construction progress is not verified progress',
          project.data?.progress_verification === 'promoter_reported',
          String(project.data?.progress_verification));
        check('the inventory and view counters cannot be seeded by the client',
          project.data?.units_total === 0 && project.data?.views_count === 0,
          `units=${project.data?.units_total} views=${project.data?.views_count}`);
        check('a new project is not published', project.data?.is_published === false,
          String(project.data?.is_published));

        const intruder = await user
          .from('projects')
          .insert({
            organization_id: org.data?.id,
            name: `Squatter ${stamp}`,
            project_type: 'plot',
            city: 'Karur',
          })
          .select('id');
        check('a non-member cannot create a project for a company', intruder.error !== null,
          intruder.error ? intruder.error.code : 'INSERT WAS ALLOWED');

        // §17 — the link is optional, but claiming a company you do not act for
        // would borrow credibility the listing has not earned.
        const borrowed = await user
          .from('properties')
          .insert({
            seller_id: testUserId,
            title: 'Borrowed credibility',
            property_type: 'apartment',
            listing_type: 'sale',
            price: 4100000,
            city: 'Karur',
            organization_id: org.data?.id,
          })
          .select('id');
        check('a seller cannot attach their listing to a company they do not act for',
          borrowed.error !== null, borrowed.error ? borrowed.error.code : 'INSERT WAS ALLOWED');

        // --- Publication, and §18's deliberate absence ----------------------
        const hidden = await anonProjects.from('projects').select('id').eq('id', project.data?.id);
        check('an unpublished project is invisible to the public', (hidden.data ?? []).length === 0,
          `rows=${hidden.data?.length ?? 0}`);

        const published = await builder
          .from('projects')
          .update({ is_published: true })
          .eq('id', project.data?.id)
          .select('is_published, published_at')
          .maybeSingle();
        check('publishing a project stamps published_at',
          published.data?.is_published === true && Boolean(published.data?.published_at),
          published.error?.message ?? JSON.stringify(published.data));

        const live = await anonProjects.from('projects').select('id').eq('id', project.data?.id);
        check('a published project is public', (live.data ?? []).length === 1,
          `rows=${live.data?.length ?? 0}`);

        /**
         * §18, which the read policy expresses by having no availability or
         * expiry condition at all. A finished, sold-out project is the builder's
         * track record and must not drop out of search the way an expired
         * listing does — so this is the assertion that would catch somebody
         * "tidying up" by adding the condition a listing has.
         */
        await builder.from('projects').update({ status: 'sold_out' }).eq('id', project.data?.id);
        const soldOut = await anonProjects.from('projects').select('id').eq('id', project.data?.id);
        check('a completed, sold-out project stays public', (soldOut.data ?? []).length === 1,
          `rows=${soldOut.data?.length ?? 0}`);
        await builder
          .from('projects').update({ status: 'under_construction' }).eq('id', project.data?.id);

        // --- §11–§16: one inventory table for flats and plots ---------------
        const building = await builder
          .from('project_buildings')
          .insert({ project_id: project.data?.id, name: 'Tower A', total_floors: 12 })
          .select('id')
          .maybeSingle();
        check('a project can hold a building', Boolean(building.data?.id),
          building.error?.message ?? 'no row returned');

        const floor = await builder
          .from('project_floors')
          .insert({ building_id: building.data?.id, floor_number: 1, display_name: '1st Floor' })
          .select('id')
          .maybeSingle();
        check('a building can hold a floor', Boolean(floor.data?.id),
          floor.error?.message ?? 'no row returned');

        // §15 — "do not force building/floor structure on plots".
        const plot = await builder
          .from('project_units')
          .insert({
            project_id: project.data?.id,
            unit_number: 'P-1',
            property_type: 'residential_plot',
            land_area: 2400,
            area_unit: 'sqft',
            price: 5500000,
            plot_dimensions: '40x60',
            is_corner: true,
          })
          .select('id, area_sqft, price_per_sqft')
          .maybeSingle();
        check('a plot needs neither a building nor a floor', Boolean(plot.data?.id),
          plot.error?.message ?? 'no row returned');
        check('a unit gets one comparable area and a price per sqft',
          Number(plot.data?.area_sqft) === 2400 && Number(plot.data?.price_per_sqft) > 0,
          `sqft=${plot.data?.area_sqft} psf=${plot.data?.price_per_sqft}`);

        const flat = await builder
          .from('project_units')
          .insert({
            project_id: project.data?.id,
            building_id: building.data?.id,
            floor_id: floor.data?.id,
            unit_number: 'A101',
            unit_type: '2 BHK',
            property_type: 'apartment',
            bedrooms: 2,
            built_up_area: 1150,
            price: 6200000,
          })
          .select('id')
          .maybeSingle();
        check('a flat can sit on a floor of a building', Boolean(flat.data?.id),
          flat.error?.message ?? 'no row returned');

        const floating = await builder
          .from('project_units')
          .insert({
            project_id: project.data?.id,
            floor_id: floor.data?.id,
            unit_number: 'A102',
            property_type: 'apartment',
          })
          .select('id');
        check('a unit cannot have a floor without a building', floating.error !== null,
          floating.error ? floating.error.code : 'INSERT WAS ALLOWED');

        /**
         * A second project, left unpublished, doing double duty: its building is
         * what proves the parentage trigger bites, and the project itself is
         * what proves an unpublished project cannot be enquired about.
         *
         * The foreign keys alone cannot say this — they prove the building
         * exists, not that it is this project's building.
         */
        const other = await builder
          .from('projects')
          .insert({
            organization_id: org.data?.id,
            name: `Blue Ridge ${stamp}`,
            project_type: 'apartment',
            city: 'Erode',
          })
          .select('id')
          .maybeSingle();
        const otherBuilding = await builder
          .from('project_buildings')
          .insert({ project_id: other.data?.id, name: 'Tower Z' })
          .select('id')
          .maybeSingle();
        const otherUnit = await builder
          .from('project_units')
          .insert({ project_id: other.data?.id, unit_number: 'Z-1', property_type: 'apartment' })
          .select('id')
          .maybeSingle();

        const crossed = await builder
          .from('project_units')
          .insert({
            project_id: project.data?.id,
            building_id: otherBuilding.data?.id,
            unit_number: 'Z1',
            property_type: 'apartment',
          })
          .select('id');
        check("a unit cannot be placed in another project's tower", crossed.error !== null,
          crossed.error ? crossed.error.code : 'INSERT WAS ALLOWED');

        await builder.from('project_units').update({ status: 'sold' }).eq('id', flat.data?.id);
        const counted = await builder
          .from('projects')
          .select('units_total, units_available, units_sold, total_units')
          .eq('id', project.data?.id)
          .maybeSingle();
        check('the project counts its own inventory',
          counted.data?.units_total === 2 &&
            counted.data?.units_available === 1 &&
            counted.data?.units_sold === 1,
          counted.error?.message ?? JSON.stringify(counted.data));
        // The brochure figure and the loaded inventory legitimately differ, and
        // the counters must not overwrite what the builder declared.
        check('the declared unit count survives the inventory count',
          counted.data?.total_units === 120, String(counted.data?.total_units));

        // --- §29: an enquiry becomes a lead ---------------------------------
        const enquiry = await user.rpc('submit_project_enquiry', {
          p_project_id: project.data?.id,
          p_unit_id: plot.data?.id,
          p_contact_name: 'Verification Buyer',
          // Deliberately not the number on this buyer's profile, and written
          // the way somebody actually types it. Rule 8 reserves the profile
          // number for a settled unlock, so the two must not be interchangeable.
          p_contact_mobile: '+91 90000 00111',
          p_message: 'Is P-1 still available?',
        });
        check('a buyer can enquire about a unit',
          enquiry.data?.ok === true && enquiry.data?.code === 'received',
          enquiry.error?.message ?? JSON.stringify(enquiry.data));

        await user.rpc('submit_project_enquiry', {
          p_project_id: project.data?.id,
          p_unit_id: plot.data?.id,
          p_contact_name: 'Verification Buyer',
          p_contact_mobile: '9000000111',
        });
        const { count: enquiryLeads } = await admin
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', project.data?.id);
        check('pressing enquire twice does not file two leads', enquiryLeads === 1,
          `leads=${enquiryLeads}`);

        const stored = await admin
          .from('leads')
          .select('message, source, contact_mobile, contact_unlock_id, seller_id, property_id')
          .eq('project_id', project.data?.id)
          .maybeSingle();
        // An empty message box on the repeat must not wipe what was said first.
        check('a repeat enquiry does not erase the first message',
          stored.data?.message === 'Is P-1 still available?', String(stored.data?.message));
        /**
         * The one that protects the revenue reports: a project lead carrying
         * `contact_unlock` would read as though ₹9 had changed hands.
         */
        check('a unit enquiry is labelled as one, not as a paid unlock',
          stored.data?.source === 'unit_enquiry' && stored.data?.contact_unlock_id === null,
          `source=${stored.data?.source} unlock=${stored.data?.contact_unlock_id}`);
        check('a project lead has no listing and no individual seller',
          stored.data?.property_id === null && stored.data?.seller_id === null,
          JSON.stringify(stored.data));

        const inbox = await builder
          .from('lead_details')
          .select('id, source, buyer_mobile, contact_display_name, project_name, unit_number, organization_name')
          .eq('project_id', project.data?.id);
        check('the company sees the enquiry in its inbox', (inbox.data ?? []).length === 1,
          inbox.error?.message ?? `rows=${inbox.data?.length ?? 0}`);
        /**
         * Rule 8 in one assertion, and the reason `lead_details` has a CASE on
         * this column rather than selecting the profile number outright. The
         * buyer's profile number is 9000000199; what they typed is 9000000111.
         * Getting the former here would mean the view had handed a builder a
         * phone number nobody paid for.
         */
        check('a project lead shows the number the buyer typed, not their profile number',
          inbox.data?.[0]?.buyer_mobile === '9000000111', String(inbox.data?.[0]?.buyer_mobile));
        check('the inbox names the project and the unit enquired about',
          String(inbox.data?.[0]?.project_name).includes('Green Valley') &&
            inbox.data?.[0]?.unit_number === 'P-1',
          JSON.stringify(inbox.data?.[0]));

        const leadId = inbox.data?.[0]?.id;

        // A builder who could edit the number they were given could then
        // dispute what was sent.
        const tamper = await builder
          .from('leads').update({ contact_mobile: '9999999999' }).eq('id', leadId).select('contact_mobile');
        check('a company cannot edit the contact details it was given', tamper.error !== null,
          tamper.error ? tamper.error.code : 'UPDATE WAS ALLOWED');

        const worked = await builder
          .from('leads')
          .update({ status: 'contacted', notes: 'Called; wants a site visit' })
          .eq('id', leadId)
          .select('status')
          .maybeSingle();
        check('a company can work the lead it received', worked.data?.status === 'contacted',
          worked.error?.message ?? String(worked.data?.status));

        const misassigned = await builder
          .from('leads').update({ assigned_to: testUserId }).eq('id', leadId).select('assigned_to');
        check('a lead cannot be assigned to somebody outside the company', misassigned.error !== null,
          misassigned.error ? misassigned.error.code : 'UPDATE WAS ALLOWED');

        const forgedLead = await user
          .from('leads')
          .insert({
            project_id: project.data?.id,
            organization_id: org.data?.id,
            buyer_id: testUserId,
            source: 'project_enquiry',
            contact_name: 'Forged',
            contact_mobile: '9000000111',
          })
          .select('id');
        check('a client cannot file a project lead directly', forgedLead.error !== null,
          forgedLead.error ? forgedLead.error.code : 'INSERT WAS ALLOWED');

        // Through the service role deliberately: it bypasses RLS, so a failure
        // here is the CHECK constraint refusing and nothing else.
        const mislabelled = await admin
          .from('leads')
          .insert({
            project_id: project.data?.id,
            organization_id: org.data?.id,
            buyer_id: testUserId,
            source: 'contact_unlock',
            contact_name: 'Mislabelled',
            contact_mobile: '9000000111',
          })
          .select('id');
        check('a project lead cannot be labelled as a paid unlock', mislabelled.error !== null,
          mislabelled.error ? mislabelled.error.code : 'INSERT WAS ALLOWED');

        // --- What the enquiry RPC refuses -----------------------------------
        const ownProject = await builder.rpc('submit_project_enquiry', {
          p_project_id: project.data?.id,
          p_contact_name: 'Verification Builder',
          p_contact_mobile: '9000000196',
        });
        check('a company cannot put an enquiry in its own inbox',
          ownProject.data?.code === 'own_project', JSON.stringify(ownProject.data));

        const unavailable = await user.rpc('submit_project_enquiry', {
          p_project_id: other.data?.id,
          p_contact_name: 'Verification Buyer',
          p_contact_mobile: '9000000111',
        });
        check('an unpublished project cannot be enquired about',
          unavailable.data?.code === 'project_unavailable', JSON.stringify(unavailable.data));

        const wrongUnit = await user.rpc('submit_project_enquiry', {
          p_project_id: project.data?.id,
          p_unit_id: otherUnit.data?.id,
          p_contact_name: 'Verification Buyer',
          p_contact_mobile: '9000000111',
        });
        check('an enquiry cannot name a unit from another project',
          wrongUnit.data?.code === 'unit_not_in_project', JSON.stringify(wrongUnit.data));

        const badMobile = await user.rpc('submit_project_enquiry', {
          p_project_id: project.data?.id,
          p_contact_name: 'Verification Buyer',
          p_contact_mobile: '12345',
        });
        check('an enquiry with an unusable number is refused',
          badMobile.data?.code === 'mobile_invalid', JSON.stringify(badMobile.data));

        /**
         * Refused at the grant, not inside the function. Migration 030 revokes
         * this RPC from `public, anon`, so an anonymous caller never reaches
         * the `sign_in_required` branch and gets 42501 instead.
         *
         * Naming `anon` in that revoke is load-bearing: a Supabase project's
         * default privileges grant EXECUTE on new functions directly to `anon`,
         * so revoking from PUBLIC alone would have left this open. That is why
         * request_contact_unlock, which only revokes from PUBLIC, really is
         * callable anonymously and answers with a tidy `unauthenticated` code.
         *
         * Either shape is a refusal, and both are accepted here — what must not
         * happen is an anonymous enquiry landing a lead.
         */
        const anonEnquiry = await anonProjects.rpc('submit_project_enquiry', {
          p_project_id: project.data?.id,
          p_contact_name: 'Drive By',
          p_contact_mobile: '9000000111',
        });
        check('an anonymous enquiry is refused',
          anonEnquiry.error?.code === '42501' || anonEnquiry.data?.code === 'sign_in_required',
          anonEnquiry.error?.code ?? JSON.stringify(anonEnquiry.data));

        const { count: afterAnon } = await admin
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', project.data?.id);
        check('the refused anonymous enquiry filed nothing', afterAnon === 1, `leads=${afterAnon}`);

        // --- §4: the public builder profile ---------------------------------
        const publicBuilder = await anonProjects
          .from('builder_public_profiles').select('*').eq('id', org.data?.id).maybeSingle();
        const builderCols = Object.keys(publicBuilder.data ?? {});
        check('the public builder profile exposes no contact or tax column',
          builderCols.length > 0 && !builderCols.some((c) => /phone|email|gst|admin_notes/i.test(c)),
          builderCols.join(','));

        /**
         * Supabase grants ALL on a new public object and a single-table view is
         * auto-updatable, so without the revoke this view is an anonymous write
         * path into `organizations` that runs as the view owner and bypasses
         * RLS entirely.
         */
        const anonWrite = await anonProjects
          .from('builder_public_profiles').update({ name: 'Owned' }).eq('id', org.data?.id).select('id');
        check('the public builder view is not an anonymous write path', anonWrite.error !== null,
          anonWrite.error ? anonWrite.error.code : 'UPDATE WAS ALLOWED');

        const viewsBefore = await admin
          .from('projects').select('views_count').eq('id', project.data?.id).maybeSingle();
        await anonProjects.rpc('record_project_view', { p_project_id: project.data?.id });
        const viewsAfter = await admin
          .from('projects').select('views_count').eq('id', project.data?.id).maybeSingle();
        check('an anonymous visitor can be counted as a project view',
          viewsAfter.data?.views_count === viewsBefore.data?.views_count + 1,
          `${viewsBefore.data?.views_count} -> ${viewsAfter.data?.views_count}`);

        // --- §22, §34: what only an admin can do ----------------------------
        const progress = await admin.rpc('admin_verify_project_progress', {
          p_project_id: project.data?.id,
        });
        check('only the admin RPC can mark construction progress verified',
          progress.data?.progress_verification === 'admin_verified',
          progress.error?.message ?? JSON.stringify(progress.data));

        const suspended = await admin.rpc('admin_verify_organization', {
          p_organization_id: org.data?.id,
          p_status: 'suspended',
          p_notes: 'Suspended by the verification suite',
        });
        check('the service role can suspend a company', suspended.data?.ok === true,
          suspended.error?.message ?? JSON.stringify(suspended.data));

        const offMarket = await anonProjects.from('projects').select('id').eq('id', project.data?.id);
        check('suspending a company takes its projects off the market',
          (offMarket.data ?? []).length === 0, `rows=${offMarket.data?.length ?? 0}`);

        const goneFromList = await anonProjects
          .from('builder_public_profiles').select('id').eq('id', org.data?.id);
        check('a suspended company disappears from the public builder list',
          (goneFromList.data ?? []).length === 0, `rows=${goneFromList.data?.length ?? 0}`);

        await admin.rpc('admin_verify_organization', {
          p_organization_id: org.data?.id,
          p_status: 'verified',
        });
        const badge = await admin
          .from('organizations')
          .select('verification_status, is_verified, verified_at')
          .eq('id', org.data?.id)
          .maybeSingle();
        check('the admin RPC is the only thing that awards the verified badge',
          badge.data?.is_verified === true && Boolean(badge.data?.verified_at),
          JSON.stringify(badge.data));

        await builder.auth.signOut();
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

    // Deleting the fixture seller cascades its listings, and with them the
    // unlocks and leads pointing at those listings. Runs even when an
    // assertion threw — a failed run must not leave fake inventory behind on
    // a live project.
    if (seededSellerId) await admin.auth.admin.deleteUser(seededSellerId);

    /**
     * Before the builder account, and explicitly — `organizations.created_by`
     * is ON DELETE SET NULL, so deleting the account on its own would leave a
     * company and two published projects behind on a live database. Deleting
     * the organization cascades the projects, their inventory and the leads
     * raised against them.
     */
    for (const orgId of createdOrgIds) {
      await admin.from('organizations').delete().eq('id', orgId);
    }
    if (builderUserId) await admin.auth.admin.deleteUser(builderUserId);

    console.log(
      `\n  (cleaned up the throwaway verification account${seededSellerId ? ' and its fixture listings' : ''}` +
        `${createdOrgIds.length ? ', and the fixture company with its projects' : ''})`,
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
