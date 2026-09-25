-- ===========================================================================
-- 99Estate — 011 · Contact-unlock engine
-- ---------------------------------------------------------------------------
-- Every decision that costs money or grants access lives in this file, inside
-- SECURITY DEFINER functions, because the tables themselves have no client
-- write path. The client never says "this one is free" or "the price is 9";
-- it says "I want this property's contact" and the database answers.
--
--   get_daily_contact_usage     Rule 4 / Rule 10 — the IST daily counter
--   get_contact_unlock_state    read-only state for the property page
--   request_contact_unlock      Rules 3-6 — free unlock or "payment required"
--   create_contact_unlock_order Rule 5 — opens a ₹9 order at a server price
--   settle_paid_contact_unlock  Rule 7 — webhook-only settlement, idempotent
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Rule 4 + Rule 10 — the daily quota, computed server-side, always.
-- ---------------------------------------------------------------------------
create or replace function public.get_daily_contact_usage(p_user_id uuid default auth.uid())
returns table (
  free_limit     integer,
  free_used      integer,
  free_remaining integer,
  paid_today     integer,
  total_today    integer,
  day_start      timestamptz,
  resets_at      timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start timestamptz := public.ist_day_start();
  v_end   timestamptz := v_start + interval '1 day';
  v_limit integer     := public.free_daily_unlock_limit();
  v_free  integer;
  v_paid  integer;
begin
  if p_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  -- A user may read their own usage; admins and trusted servers may read anyone's.
  if not (p_user_id = auth.uid() or public.is_admin() or public.is_service_role()) then
    raise exception 'not authorised to read another user''s usage' using errcode = '42501';
  end if;

  -- Only settled unlocks count. Viewing a property never does.
  select
    count(*) filter (where is_free),
    count(*) filter (where not is_free)
  into v_free, v_paid
  from public.contact_unlocks
  where user_id = p_user_id
    and payment_status = 'success'
    and unlocked_at >= v_start
    and unlocked_at <  v_end;

  return query select
    v_limit,
    v_free,
    greatest(0, v_limit - v_free),
    v_paid,
    v_free + v_paid,
    v_start,
    v_end;
end;
$$;

comment on function public.get_daily_contact_usage is
  'Free-unlock quota for an IST calendar day. Resets at 00:00 Asia/Kolkata, not on a rolling 24h window.';

-- ---------------------------------------------------------------------------
-- Internal: the seller contact payload, only ever built after authorisation.
-- ---------------------------------------------------------------------------
create or replace function public.build_seller_contact(p_seller_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'seller_id',     p.id,
    'seller_name',   p.full_name,
    'seller_mobile', p.mobile_number,
    'seller_avatar', p.avatar_url,
    'seller_type',   p.role
  )
  from public.profiles p
  where p.id = p_seller_id;
$$;

revoke all on function public.build_seller_contact(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Read-only state for the contact card on /property/[slug].
-- Returns the seller's number ONLY when a settled unlock already exists.
-- ---------------------------------------------------------------------------
create or replace function public.get_contact_unlock_state(p_property_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_seller_id uuid;
  v_unlock    public.contact_unlocks;
  v_usage     record;
  v_price     numeric := public.contact_unlock_price();
  v_currency  text    := public.default_currency();
  v_base      jsonb;
begin
  select seller_id into v_seller_id from public.properties where id = p_property_id;
  if v_seller_id is null then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  v_base := jsonb_build_object(
    'ok', true,
    'price', v_price,
    'currency', v_currency,
    'free_limit', public.free_daily_unlock_limit()
  );

  -- Signed out: show the offer, never the number.
  if v_uid is null then
    return v_base || jsonb_build_object(
      'code', 'sign_in_required',
      'unlocked', false,
      'is_own_listing', false,
      'requires_payment', false
    );
  end if;

  if v_uid = v_seller_id then
    return v_base || jsonb_build_object(
      'code', 'own_listing', 'unlocked', false, 'is_own_listing', true, 'requires_payment', false
    );
  end if;

  select * into v_usage from public.get_daily_contact_usage(v_uid);

  v_base := v_base || jsonb_build_object(
    'free_used',      v_usage.free_used,
    'free_remaining', v_usage.free_remaining,
    'resets_at',      v_usage.resets_at
  );

  -- Rule 6: already unlocked → hand back the contact, charge nothing.
  select * into v_unlock
  from public.contact_unlocks
  where user_id = v_uid and property_id = p_property_id and payment_status = 'success'
  limit 1;

  if found then
    return v_base
      || jsonb_build_object(
           'code', 'already_unlocked',
           'unlocked', true,
           'is_own_listing', false,
           'requires_payment', false,
           'contact_unlock_id', v_unlock.id,
           'unlocked_at', v_unlock.unlocked_at,
           'was_free', v_unlock.is_free
         )
      || public.build_seller_contact(v_seller_id);
  end if;

  if not public.property_is_live(p_property_id) then
    return v_base || jsonb_build_object(
      'code', 'unavailable', 'unlocked', false, 'is_own_listing', false, 'requires_payment', false
    );
  end if;

  if not public.profile_is_complete(v_uid) then
    return v_base || jsonb_build_object(
      'code', 'profile_incomplete', 'unlocked', false, 'is_own_listing', false,
      'requires_payment', v_usage.free_remaining <= 0
    );
  end if;

  return v_base || jsonb_build_object(
    'code', case when v_usage.free_remaining > 0 then 'free_available' else 'payment_required' end,
    'unlocked', false,
    'is_own_listing', false,
    'requires_payment', v_usage.free_remaining <= 0
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- §6 — the unlock decision. Free path settles here and now; the paid path
-- returns `payment_required` and settles only after a verified webhook.
-- ---------------------------------------------------------------------------
create or replace function public.request_contact_unlock(p_property_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_property  record;
  v_unlock    public.contact_unlocks;
  v_usage     record;
  v_price     numeric := public.contact_unlock_price();
  v_currency  text    := public.default_currency();
  v_lead_id   uuid;
begin
  -- Step 1 — authentication.
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'unauthenticated');
  end if;

  select id, seller_id, title, slug, status, expires_at, city, locality
    into v_property
  from public.properties
  where id = p_property_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  if v_property.seller_id = v_uid then
    return jsonb_build_object('ok', false, 'code', 'own_listing');
  end if;

  -- Step 3 (checked before the profile gate so a repeat visit always works,
  -- even if the listing has since gone off-market — Rule 6).
  select * into v_unlock
  from public.contact_unlocks
  where user_id = v_uid and property_id = p_property_id and payment_status = 'success'
  limit 1;

  if found then
    return jsonb_build_object(
      'ok', true,
      'code', 'already_unlocked',
      'contact_unlock_id', v_unlock.id,
      'is_free', v_unlock.is_free,
      'amount', v_unlock.amount,
      'currency', v_unlock.currency,
      'unlocked_at', v_unlock.unlocked_at
    ) || public.build_seller_contact(v_property.seller_id);
  end if;

  -- Step 2 — a reachable buyer is the whole point of a lead.
  if not public.profile_is_complete(v_uid) then
    return jsonb_build_object('ok', false, 'code', 'profile_incomplete');
  end if;

  if not (v_property.status = 'published'
          and (v_property.expires_at is null or v_property.expires_at > now())) then
    return jsonb_build_object('ok', false, 'code', 'unavailable');
  end if;

  -- Serialise this user's unlock attempts so two tabs cannot both observe
  -- "1 free left" and both spend it. Transaction-scoped: released on commit.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  -- Step 4 — recount *after* taking the lock.
  select * into v_usage from public.get_daily_contact_usage(v_uid);

  if v_usage.free_remaining <= 0 then
    return jsonb_build_object(
      'ok', true,
      'code', 'payment_required',
      'amount', v_price,
      'currency', v_currency,
      'free_used', v_usage.free_used,
      'free_remaining', 0,
      'resets_at', v_usage.resets_at
    );
  end if;

  insert into public.contact_unlocks
    (user_id, property_id, seller_id, amount, currency, is_free, payment_status, unlocked_at)
  values
    (v_uid, p_property_id, v_property.seller_id, 0, v_currency, true, 'success', now())
  on conflict (user_id, property_id) where payment_status = 'success' do nothing
  returning * into v_unlock;

  if v_unlock.id is null then
    -- Lost a race against a concurrent unlock of the same listing; the other
    -- transaction already granted it, so just return that one.
    select * into v_unlock
    from public.contact_unlocks
    where user_id = v_uid and property_id = p_property_id and payment_status = 'success'
    limit 1;

    return jsonb_build_object(
      'ok', true, 'code', 'already_unlocked',
      'contact_unlock_id', v_unlock.id, 'is_free', v_unlock.is_free,
      'amount', v_unlock.amount, 'currency', v_unlock.currency,
      'unlocked_at', v_unlock.unlocked_at
    ) || public.build_seller_contact(v_property.seller_id);
  end if;

  -- Rule 9 — every settled unlock produces a seller lead.
  insert into public.leads (property_id, seller_id, buyer_id, contact_unlock_id)
  values (p_property_id, v_property.seller_id, v_uid, v_unlock.id)
  on conflict (contact_unlock_id) do nothing
  returning id into v_lead_id;

  perform public.create_notification(
    v_property.seller_id,
    'New lead on ' || v_property.title,
    'A buyer just unlocked your contact details.',
    'new_lead',
    '/dashboard/leads',
    jsonb_build_object('property_id', p_property_id, 'lead_id', v_lead_id)
  );

  perform public.create_notification(
    v_uid,
    'Contact unlocked',
    'You used a free contact unlock. ' || (v_usage.free_remaining - 1) || ' free left today.',
    'contact_unlock',
    '/property/' || coalesce(v_property.slug || '-', '') || p_property_id::text,
    jsonb_build_object('property_id', p_property_id, 'is_free', true)
  );

  return jsonb_build_object(
    'ok', true,
    'code', 'unlocked_free',
    'contact_unlock_id', v_unlock.id,
    'is_free', true,
    'amount', 0,
    'currency', v_currency,
    'free_used', v_usage.free_used + 1,
    'free_remaining', greatest(0, v_usage.free_remaining - 1),
    'resets_at', v_usage.resets_at,
    'unlocked_at', v_unlock.unlocked_at
  ) || public.build_seller_contact(v_property.seller_id);
end;
$$;

comment on function public.request_contact_unlock is
  'Single entry point for §6. Grants a free unlock when quota allows, otherwise reports payment_required. Never trusts the client for price or eligibility.';

-- ---------------------------------------------------------------------------
-- Rule 5 — open a paid order. The amount comes from app_settings, never from
-- the request body, so a tampered client cannot buy an unlock for ₹1.
-- ---------------------------------------------------------------------------
create or replace function public.create_contact_unlock_order(
  p_property_id uuid,
  p_provider    text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_property record;
  v_usage    record;
  v_price    numeric := public.contact_unlock_price();
  v_currency text    := public.default_currency();
  v_payment  public.payments;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'unauthenticated');
  end if;
  if not public.profile_is_complete(v_uid) then
    return jsonb_build_object('ok', false, 'code', 'profile_incomplete');
  end if;

  select id, seller_id, title, status, expires_at into v_property
  from public.properties where id = p_property_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_property.seller_id = v_uid then
    return jsonb_build_object('ok', false, 'code', 'own_listing');
  end if;
  if not (v_property.status = 'published'
          and (v_property.expires_at is null or v_property.expires_at > now())) then
    return jsonb_build_object('ok', false, 'code', 'unavailable');
  end if;

  -- Rule 6 — refuse to take money for something already owned.
  if exists (
    select 1 from public.contact_unlocks
    where user_id = v_uid and property_id = p_property_id and payment_status = 'success'
  ) then
    return jsonb_build_object('ok', false, 'code', 'already_unlocked');
  end if;

  -- Rule 4 — if a free unlock is still available, do not charge for one.
  select * into v_usage from public.get_daily_contact_usage(v_uid);
  if v_usage.free_remaining > 0 then
    return jsonb_build_object('ok', false, 'code', 'free_available',
                              'free_remaining', v_usage.free_remaining);
  end if;

  -- Reuse an order that is still open for this buyer + listing instead of
  -- littering the ledger every time the dialog is reopened.
  select * into v_payment
  from public.payments
  where user_id = v_uid
    and property_id = p_property_id
    and status in ('created', 'pending')
    and created_at > now() - interval '30 minutes'
  order by created_at desc
  limit 1;

  if not found then
    insert into public.payments (user_id, property_id, amount, currency, provider, status, metadata)
    values (v_uid, p_property_id, v_price, v_currency, p_provider, 'created',
            jsonb_build_object('purpose', 'contact_unlock'))
    returning * into v_payment;
  end if;

  return jsonb_build_object(
    'ok', true,
    'code', 'order_created',
    'payment_id', v_payment.id,
    'amount', v_payment.amount,
    'currency', v_payment.currency,
    'provider', v_payment.provider,
    'provider_order_id', v_payment.provider_order_id,
    'property_id', p_property_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Server-only: record the gateway's order handle against our payment row.
-- ---------------------------------------------------------------------------
create or replace function public.attach_payment_order(
  p_payment_id        uuid,
  p_provider_order_id text,
  p_metadata          jsonb default '{}'::jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_service_role() then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  update public.payments
     set provider_order_id = p_provider_order_id,
         status            = case when status = 'created' then 'pending' else status end,
         metadata          = metadata || coalesce(p_metadata, '{}'::jsonb)
   where id = p_payment_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Rule 7 — the ONLY way a paid unlock comes into existence. Called from the
-- signature-verified webhook with the service-role key. Idempotent, because
-- gateways retry.
-- ---------------------------------------------------------------------------
create or replace function public.settle_paid_contact_unlock(
  p_payment_id          uuid,
  p_provider_payment_id text,
  p_metadata            jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_payment  public.payments;
  v_property record;
  v_unlock   public.contact_unlocks;
  v_lead_id  uuid;
begin
  if not public.is_service_role() then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  -- Serialise concurrent webhook deliveries for the same order.
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'payment_not_found');
  end if;

  -- Replay of an already-settled event.
  if v_payment.status = 'success' then
    select * into v_unlock from public.contact_unlocks where id = v_payment.contact_unlock_id;
    return jsonb_build_object('ok', true, 'code', 'already_settled',
                              'contact_unlock_id', v_payment.contact_unlock_id,
                              'property_id', v_payment.property_id);
  end if;

  if v_payment.property_id is null then
    return jsonb_build_object('ok', false, 'code', 'payment_has_no_property');
  end if;

  select id, seller_id, title, slug into v_property
  from public.properties where id = v_payment.property_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'property_not_found');
  end if;

  -- Rule 6 — the buyer already holds this contact. Settle the payment so the
  -- ledger is accurate and flag it for refund rather than double-granting.
  select * into v_unlock
  from public.contact_unlocks
  where user_id = v_payment.user_id
    and property_id = v_payment.property_id
    and payment_status = 'success'
  limit 1;

  if found then
    update public.payments
       set status              = 'success',
           provider_payment_id = coalesce(p_provider_payment_id, provider_payment_id),
           contact_unlock_id   = v_unlock.id,
           metadata            = metadata || coalesce(p_metadata, '{}'::jsonb)
                                           || jsonb_build_object('refund_required', true,
                                                                 'refund_reason', 'duplicate_unlock')
     where id = v_payment.id;

    return jsonb_build_object('ok', true, 'code', 'duplicate_unlock_refund_required',
                              'contact_unlock_id', v_unlock.id,
                              'property_id', v_payment.property_id);
  end if;

  insert into public.contact_unlocks
    (user_id, property_id, seller_id, amount, currency, is_free, payment_id, payment_status, unlocked_at)
  values
    (v_payment.user_id, v_payment.property_id, v_property.seller_id,
     v_payment.amount, v_payment.currency, false, v_payment.id, 'success', now())
  on conflict (user_id, property_id) where payment_status = 'success' do nothing
  returning * into v_unlock;

  if v_unlock.id is null then
    select * into v_unlock
    from public.contact_unlocks
    where user_id = v_payment.user_id and property_id = v_payment.property_id
      and payment_status = 'success'
    limit 1;
  end if;

  update public.payments
     set status              = 'success',
         provider_payment_id = coalesce(p_provider_payment_id, provider_payment_id),
         contact_unlock_id   = v_unlock.id,
         failure_reason      = null,
         metadata            = metadata || coalesce(p_metadata, '{}'::jsonb)
   where id = v_payment.id;

  -- Rule 9.
  insert into public.leads (property_id, seller_id, buyer_id, contact_unlock_id)
  values (v_payment.property_id, v_property.seller_id, v_payment.user_id, v_unlock.id)
  on conflict (contact_unlock_id) do nothing
  returning id into v_lead_id;

  perform public.create_notification(
    v_payment.user_id,
    'Payment successful',
    'Your ₹' || trim(to_char(v_payment.amount, 'FM999999990.00')) || ' contact unlock is ready.',
    'payment',
    '/property/' || coalesce(v_property.slug || '-', '') || v_property.id::text,
    jsonb_build_object('payment_id', v_payment.id, 'property_id', v_property.id)
  );

  perform public.create_notification(
    v_property.seller_id,
    'New lead on ' || v_property.title,
    'A buyer just unlocked your contact details.',
    'new_lead',
    '/dashboard/leads',
    jsonb_build_object('property_id', v_property.id, 'lead_id', v_lead_id)
  );

  return jsonb_build_object('ok', true, 'code', 'settled',
                            'contact_unlock_id', v_unlock.id,
                            'property_id', v_property.id,
                            'amount', v_payment.amount);
end;
$$;

-- ---------------------------------------------------------------------------
create or replace function public.fail_payment(
  p_payment_id uuid,
  p_reason     text,
  p_metadata   jsonb default '{}'::jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_service_role() then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  update public.payments
     set status         = 'failed',
         failure_reason = left(p_reason, 500),
         metadata       = metadata || coalesce(p_metadata, '{}'::jsonb)
   where id = p_payment_id
     and status <> 'success';   -- never downgrade a settled payment
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: browser-callable vs server-only.
-- ---------------------------------------------------------------------------
revoke all on function public.get_daily_contact_usage(uuid)                  from public;
revoke all on function public.get_contact_unlock_state(uuid)                 from public;
revoke all on function public.request_contact_unlock(uuid)                   from public;
revoke all on function public.create_contact_unlock_order(uuid, text)        from public;
revoke all on function public.attach_payment_order(uuid, text, jsonb)        from public, anon, authenticated;
revoke all on function public.settle_paid_contact_unlock(uuid, text, jsonb)  from public, anon, authenticated;
revoke all on function public.fail_payment(uuid, text, jsonb)                from public, anon, authenticated;

grant execute on function public.get_daily_contact_usage(uuid)           to authenticated;
grant execute on function public.get_contact_unlock_state(uuid)          to anon, authenticated;
grant execute on function public.request_contact_unlock(uuid)            to authenticated;
grant execute on function public.create_contact_unlock_order(uuid, text) to authenticated;
