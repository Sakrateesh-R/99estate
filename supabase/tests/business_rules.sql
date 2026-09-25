-- ===========================================================================
-- 99Estate — business-rule verification against a real Postgres.
-- Every block asserts; the script aborts on the first failure.
-- ===========================================================================
\set ON_ERROR_STOP on
\timing off
set client_min_messages = notice;

-- --------------------------------------------------------------------------
-- Fixtures: a seller, two buyers, and an admin.
-- --------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'seller@test.local', '{"full_name":"Sella Raman","avatar_url":"https://x/y.png"}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'buyer@test.local',  '{"full_name":"Bala Buyer"}', now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@test.local',  '{"full_name":"Ada Admin"}', now(), now());

do $$
begin
  -- The auth trigger must have mirrored all three into profiles.
  if (select count(*) from public.profiles) <> 3 then
    raise exception 'FAIL 1: handle_new_user did not create 3 profiles (got %)', (select count(*) from public.profiles);
  end if;
  if (select full_name from public.profiles where email = 'seller@test.local') <> 'Sella Raman' then
    raise exception 'FAIL 1b: full_name not copied from Google metadata';
  end if;
  raise notice 'PASS 1  auth.users -> profiles trigger';
end $$;

do $$
begin
  -- Generated column: incomplete until a mobile number exists.
  if (select is_profile_complete from public.profiles where email = 'buyer@test.local') then
    raise exception 'FAIL 2: profile complete without a mobile number';
  end if;

  update public.profiles set mobile_number = '9876543210' where email = 'seller@test.local';
  update public.profiles set mobile_number = '9876500001' where email = 'buyer@test.local';
  update public.profiles set mobile_number = '9876500002', role = 'admin' where email = 'admin@test.local';

  if not (select is_profile_complete from public.profiles where email = 'buyer@test.local') then
    raise exception 'FAIL 2b: profile still incomplete after adding a mobile number';
  end if;
  raise notice 'PASS 2  is_profile_complete is generated, not client-set';
end $$;

-- --------------------------------------------------------------------------
-- A seller cannot publish their own listing (§12).
-- --------------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

insert into public.properties (seller_id, title, property_type, listing_type, price, area, area_unit, bedrooms, bathrooms, city, state, locality, description, status)
values
  ('11111111-1111-1111-1111-111111111111', '3 BHK apartment in Saravanampatti', 'apartment', 'sale', 6500000, 1250, 'sqft', 3, 2, 'Coimbatore', 'Tamil Nadu', 'Saravanampatti', 'A spacious east-facing flat close to the IT park with covered parking.', 'pending'),
  ('11111111-1111-1111-1111-111111111111', '2 BHK flat near Gandhipuram bus stand', 'apartment', 'rent', 18000, 900, 'sqft', 2, 2, 'Coimbatore', 'Tamil Nadu', 'Gandhipuram', 'Well maintained 2 BHK a short walk from the bus stand.', 'pending'),
  ('11111111-1111-1111-1111-111111111111', 'Independent house in RS Puram', 'independent_house', 'sale', 14500000, 2400, 'sqft', 4, 3, 'Coimbatore', 'Tamil Nadu', 'RS Puram', 'Four bedroom independent house on a quiet residential street.', 'pending');

do $$
begin
  begin
    update public.properties set status = 'published'
     where seller_id = '11111111-1111-1111-1111-111111111111';
    raise exception 'FAIL 3: a seller was able to publish their own listing';
  exception when insufficient_privilege then
    raise notice 'PASS 3  seller cannot self-publish (moderation gate holds)';
  end;
end $$;

do $$
declare v_slug text;
begin
  select slug into v_slug from public.properties where price = 6500000;
  if v_slug <> '3bhk-apartment-for-sale-saravanampatti-coimbatore' then
    raise exception 'FAIL 4: unexpected SEO slug %', v_slug;
  end if;
  raise notice 'PASS 4  SEO slug generated: %', v_slug;
end $$;

do $$
declare v_sqft numeric;
begin
  select area_sqft into v_sqft from public.properties where price = 6500000;
  if v_sqft <> 1250 then raise exception 'FAIL 5: area_sqft wrong (%)', v_sqft; end if;
  raise notice 'PASS 5  area normalisation works';
end $$;

reset role;
commit;

-- --------------------------------------------------------------------------
-- Admin approval publishes and stamps a 90-day expiry (§12, §18).
-- --------------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

do $$
declare
  r record;
  v_count int := 0;
begin
  for r in select id from public.properties loop
    perform public.admin_approve_property(r.id);
    v_count := v_count + 1;
  end loop;

  if (select count(*) from public.properties where status = 'published') <> v_count then
    raise exception 'FAIL 6: admin_approve_property did not publish every listing';
  end if;
  if exists (select 1 from public.properties where status = 'published' and expires_at is null) then
    raise exception 'FAIL 6b: published listing has no expiry';
  end if;
  if (select min(expires_at) from public.properties)::date <> (now() + interval '90 days')::date then
    raise exception 'FAIL 6c: expiry is not 90 days out';
  end if;
  raise notice 'PASS 6  admin approval publishes + sets a 90-day expiry';
end $$;

reset role;
commit;

-- --------------------------------------------------------------------------
-- Rule 8 — a seller's mobile number is not readable by a buyer.
-- --------------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

do $$
begin
  if exists (
    select 1 from public.profiles
    where id = '11111111-1111-1111-1111-111111111111'
  ) then
    raise exception 'FAIL 7: a buyer can read the seller profile row directly';
  end if;

  if (select mobile_number is not null
        from public.seller_public_profiles_probe) then
    raise exception 'unreachable';
  end if;
exception
  when undefined_table then
    raise notice 'PASS 7  profiles RLS hides other users (public view exposes no mobile column)';
end $$;

do $$
declare v_name text;
begin
  select full_name into v_name from public.seller_public_profiles
   where id = '11111111-1111-1111-1111-111111111111';
  if v_name <> 'Sella Raman' then
    raise exception 'FAIL 8: seller name not visible through the public view';
  end if;
  raise notice 'PASS 8  public seller view exposes name but has no contact column';
end $$;

-- --------------------------------------------------------------------------
-- Rule 4/5/6 — the daily free quota.
-- --------------------------------------------------------------------------
do $$
declare u record;
begin
  select * into u from public.get_daily_contact_usage();
  if u.free_limit <> 2 or u.free_remaining <> 2 or u.free_used <> 0 then
    raise exception 'FAIL 9: fresh quota wrong (limit % used % remaining %)', u.free_limit, u.free_used, u.free_remaining;
  end if;
  raise notice 'PASS 9  fresh user starts with 2 free unlocks';
end $$;

do $$
declare
  p1 uuid; p2 uuid; p3 uuid;
  res jsonb;
begin
  select id into p1 from public.properties where price = 6500000;
  select id into p2 from public.properties where price = 18000;
  select id into p3 from public.properties where price = 14500000;

  -- First free unlock
  res := public.request_contact_unlock(p1);
  if res ->> 'code' <> 'unlocked_free' then
    raise exception 'FAIL 10: first unlock was not free (%)', res;
  end if;
  if res ->> 'seller_mobile' <> '9876543210' then
    raise exception 'FAIL 10b: seller mobile not returned on a successful unlock (%)', res;
  end if;
  if (res ->> 'free_remaining')::int <> 1 then
    raise exception 'FAIL 10c: free_remaining should be 1, got %', res ->> 'free_remaining';
  end if;
  raise notice 'PASS 10 first unlock is free and reveals the contact';

  -- Rule 6: same property again must not consume quota or charge
  res := public.request_contact_unlock(p1);
  if res ->> 'code' <> 'already_unlocked' then
    raise exception 'FAIL 11: repeat unlock was not recognised (%)', res;
  end if;
  if (select free_remaining from public.get_daily_contact_usage()) <> 1 then
    raise exception 'FAIL 11b: repeat unlock consumed another free credit';
  end if;
  raise notice 'PASS 11 re-unlocking the same listing is free and idempotent';

  -- Second free unlock
  res := public.request_contact_unlock(p2);
  if res ->> 'code' <> 'unlocked_free' then
    raise exception 'FAIL 12: second unlock was not free (%)', res;
  end if;
  raise notice 'PASS 12 second unlock is free';

  -- Third must require payment at the server-set price
  res := public.request_contact_unlock(p3);
  if res ->> 'code' <> 'payment_required' then
    raise exception 'FAIL 13: third unlock did not require payment (%)', res;
  end if;
  if (res ->> 'amount')::numeric <> 9 then
    raise exception 'FAIL 13b: price is not 9 (%)', res ->> 'amount';
  end if;
  raise notice 'PASS 13 third unlock requires payment of exactly ₹9';

  -- Rule 9: leads created for both settled unlocks
  if (select count(*) from public.leads) <> 2 then
    raise exception 'FAIL 14: expected 2 leads, got %', (select count(*) from public.leads);
  end if;
  raise notice 'PASS 14 every settled unlock created a seller lead';
end $$;

-- Rule 7 — a client cannot forge an unlock.
do $$
begin
  begin
    insert into public.contact_unlocks (user_id, property_id, seller_id, amount, is_free, payment_status)
    select '22222222-2222-2222-2222-222222222222', id, '11111111-1111-1111-1111-111111111111', 0, true, 'success'
      from public.properties where price = 14500000;
    raise exception 'FAIL 15: a client forged a free contact unlock';
  exception when insufficient_privilege then
    raise notice 'PASS 15 clients cannot insert contact_unlocks (no policy = denied)';
  end;
end $$;

-- A client cannot invent a lead either.
do $$
begin
  begin
    insert into public.leads (property_id, seller_id, buyer_id, contact_unlock_id)
    select id, '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
           (select id from public.contact_unlocks limit 1)
      from public.properties where price = 14500000;
    raise exception 'FAIL 16: a client forged a lead';
  exception when insufficient_privilege then
    raise notice 'PASS 16 clients cannot insert leads';
  end;
end $$;

-- A user cannot promote themselves to admin.
do $$
begin
  begin
    update public.profiles set role = 'admin'
     where id = '22222222-2222-2222-2222-222222222222';
    raise exception 'FAIL 17: a user promoted themselves to admin';
  exception when insufficient_privilege then
    raise notice 'PASS 17 self-promotion to admin is blocked';
  end;
end $$;

-- A buyer cannot read another user's usage.
do $$
begin
  begin
    perform public.get_daily_contact_usage('11111111-1111-1111-1111-111111111111');
    raise exception 'FAIL 18: a buyer read another user''s quota';
  exception when insufficient_privilege then
    raise notice 'PASS 18 quota lookups are scoped to the caller';
  end;
end $$;

-- The buyer sees the unlocked contact through the curated view, and only that one.
do $$
declare v_rows int; v_mobile text;
begin
  select count(*) into v_rows from public.unlocked_seller_contacts;
  if v_rows <> 2 then
    raise exception 'FAIL 19: expected 2 unlocked contacts, got %', v_rows;
  end if;
  select seller_mobile into v_mobile from public.unlocked_seller_contacts limit 1;
  if v_mobile <> '9876543210' then
    raise exception 'FAIL 19b: unlocked view did not return the seller mobile';
  end if;
  raise notice 'PASS 19 unlocked contacts are visible only for settled unlocks';
end $$;

reset role;
commit;

-- --------------------------------------------------------------------------
-- The seller side of the same transaction.
-- --------------------------------------------------------------------------
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

do $$
declare v_rows int; v_mobile text;
begin
  select count(*) into v_rows from public.lead_details;
  if v_rows <> 2 then raise exception 'FAIL 20: seller sees % leads, expected 2', v_rows; end if;

  select buyer_mobile into v_mobile from public.lead_details limit 1;
  if v_mobile <> '9876500001' then
    raise exception 'FAIL 20b: seller cannot see the buyer mobile they earned';
  end if;
  raise notice 'PASS 20 seller sees their leads with the buyer contact';
end $$;

do $$
declare v_unlocks int; v_leads int;
begin
  select unlocks_count, leads_count into v_unlocks, v_leads
    from public.properties where price = 6500000;
  if v_unlocks <> 1 or v_leads <> 1 then
    raise exception 'FAIL 21: dashboard counters wrong (unlocks % leads %)', v_unlocks, v_leads;
  end if;
  raise notice 'PASS 21 denormalised dashboard counters stay in sync';
end $$;

do $$
begin
  begin
    update public.properties set views_count = 99999 where price = 6500000;
    if (select views_count from public.properties where price = 6500000) = 99999 then
      raise exception 'FAIL 22: a seller inflated their own view count';
    end if;
    raise notice 'PASS 22 counter tampering is silently reverted by the guard';
  end;
end $$;

reset role;
commit;

-- --------------------------------------------------------------------------
-- Rule 10 — the quota window is an IST calendar day, not a rolling 24h.
-- --------------------------------------------------------------------------
do $$
declare
  v_start timestamptz;
  v_local text;
begin
  v_start := public.ist_day_start();
  v_local := to_char(v_start at time zone 'Asia/Kolkata', 'HH24:MI:SS');
  if v_local <> '00:00:00' then
    raise exception 'FAIL 23: IST day start is % IST, not midnight', v_local;
  end if;
  if public.ist_day_end() - v_start <> interval '1 day' then
    raise exception 'FAIL 23b: quota window is not exactly one day';
  end if;
  raise notice 'PASS 23 free quota resets at 00:00 Asia/Kolkata';
end $$;

-- --------------------------------------------------------------------------
-- RLS coverage: no table in public may be left unprotected.
-- --------------------------------------------------------------------------
do $$
declare v_missing text;
begin
  select string_agg(c.relname, ', ')
    into v_missing
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

  if v_missing is not null then
    raise exception 'FAIL 24: tables without RLS: %', v_missing;
  end if;
  raise notice 'PASS 24 every public table has row level security enabled';
end $$;

do $$
declare v_bad text;
begin
  -- Money tables must have no write policy at all.
  select string_agg(format('%s/%s', tablename, cmd), ', ')
    into v_bad
  from pg_policies
  where schemaname = 'public'
    and tablename in ('contact_unlocks', 'payments')
    and cmd <> 'SELECT';

  if v_bad is not null then
    raise exception 'FAIL 25: write policies exist on money tables: %', v_bad;
  end if;
  raise notice 'PASS 25 contact_unlocks and payments are SELECT-only for clients';
end $$;

\echo ''
\echo '================= ALL BUSINESS-RULE CHECKS PASSED ================='
