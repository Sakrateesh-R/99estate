-- ===========================================================================
-- 99Estate — 013 · Moderation and listing lifecycle
-- ---------------------------------------------------------------------------
-- Admin approval (§12), the 90-day expiry cycle (§18) and renewal. Each of
-- these is an RPC rather than a raw UPDATE so the notification side effects
-- (§19) cannot be forgotten by a caller.
-- ===========================================================================

create or replace function public.admin_approve_property(p_property_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_property record;
begin
  if not (public.is_admin() or public.is_service_role()) then
    raise exception 'admin privileges required' using errcode = '42501';
  end if;

  update public.properties
     set status           = 'published',
         published_at     = coalesce(published_at, now()),
         expires_at       = now() + make_interval(days => public.listing_duration_days()),
         rejection_reason = null
   where id = p_property_id
     and status in ('pending', 'draft', 'rejected', 'expired')
  returning id, seller_id, title, slug, expires_at into v_property;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_approvable');
  end if;

  perform public.create_notification(
    v_property.seller_id,
    'Your property is live',
    v_property.title || ' has been approved and is now visible to buyers.',
    'property_approved',
    '/property/' || coalesce(v_property.slug || '-', '') || v_property.id::text,
    jsonb_build_object('property_id', v_property.id, 'expires_at', v_property.expires_at)
  );

  return jsonb_build_object('ok', true, 'code', 'published',
                            'property_id', v_property.id,
                            'expires_at', v_property.expires_at);
end;
$$;

create or replace function public.admin_reject_property(p_property_id uuid, p_reason text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_property record;
begin
  if not (public.is_admin() or public.is_service_role()) then
    raise exception 'admin privileges required' using errcode = '42501';
  end if;
  if char_length(coalesce(trim(p_reason), '')) < 5 then
    return jsonb_build_object('ok', false, 'code', 'reason_required');
  end if;

  update public.properties
     set status           = 'rejected',
         rejection_reason = left(trim(p_reason), 1000)
   where id = p_property_id
  returning id, seller_id, title into v_property;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  perform public.create_notification(
    v_property.seller_id,
    'Listing needs changes',
    v_property.title || ' was not approved: ' || left(trim(p_reason), 300),
    'property_rejected',
    '/dashboard/properties',
    jsonb_build_object('property_id', v_property.id)
  );

  return jsonb_build_object('ok', true, 'code', 'rejected', 'property_id', v_property.id);
end;
$$;

create or replace function public.admin_set_verification(
  p_property_id uuid,
  p_status      public.verification_status,
  p_notes       text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_property record;
begin
  if not (public.is_admin() or public.is_service_role()) then
    raise exception 'admin privileges required' using errcode = '42501';
  end if;

  update public.properties
     set verification_status = p_status
   where id = p_property_id
  returning id, seller_id, title, slug into v_property;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  update public.verification_requests
     set status      = p_status,
         admin_notes = p_notes,
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where property_id = p_property_id
     and status = 'pending';

  perform public.create_notification(
    v_property.seller_id,
    case p_status
      when 'verified' then 'Listing verified'
      when 'rejected' then 'Verification declined'
      else 'Verification updated'
    end,
    coalesce(p_notes, v_property.title),
    'verification',
    '/dashboard/properties',
    jsonb_build_object('property_id', v_property.id, 'verification_status', p_status)
  );

  return jsonb_build_object('ok', true, 'code', 'updated', 'property_id', v_property.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- §18 — expiry sweep. Idempotent, so it is safe to run from pg_cron, a
-- Supabase Edge Function schedule, or an admin button.
-- ---------------------------------------------------------------------------
create or replace function public.expire_stale_properties()
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_row   record;
  v_count integer := 0;
begin
  if not (public.is_admin() or public.is_service_role()) then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  for v_row in
    update public.properties
       set status = 'expired'
     where status = 'published'
       and expires_at is not null
       and expires_at <= now()
    returning id, seller_id, title
  loop
    v_count := v_count + 1;
    perform public.create_notification(
      v_row.seller_id,
      'Listing expired',
      v_row.title || ' has been removed from search. Renew it to go live again.',
      'property_expiry',
      '/dashboard/properties',
      jsonb_build_object('property_id', v_row.id)
    );
  end loop;

  return v_count;
end;
$$;

-- Seven-day heads-up, at most once per listing per cycle.
create or replace function public.notify_expiring_properties(p_days_ahead integer default 7)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_row   record;
  v_count integer := 0;
begin
  if not (public.is_admin() or public.is_service_role()) then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  for v_row in
    select p.id, p.seller_id, p.title, p.expires_at
    from public.properties p
    where p.status = 'published'
      and p.expires_at between now() and now() + make_interval(days => p_days_ahead)
      and not exists (
        select 1 from public.notifications n
        where n.user_id = p.seller_id
          and n.type = 'property_expiry'
          and n.data ->> 'property_id' = p.id::text
          and n.created_at > coalesce(p.last_renewed_at, p.published_at, p.created_at)
      )
  loop
    v_count := v_count + 1;
    perform public.create_notification(
      v_row.seller_id,
      'Listing expiring soon',
      v_row.title || ' expires on ' || to_char(v_row.expires_at at time zone 'Asia/Kolkata', 'DD Mon YYYY') || '.',
      'property_expiry',
      '/dashboard/properties',
      jsonb_build_object('property_id', v_row.id, 'expires_at', v_row.expires_at)
    );
  end loop;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Seller-facing renewal. Resets the 90-day clock and, for a listing that was
-- previously approved, puts it straight back on the market.
-- ---------------------------------------------------------------------------
create or replace function public.renew_property(p_property_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_property record;
begin
  if not (public.owns_property(p_property_id) or public.is_admin()) then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  select id, status, published_at into v_property
  from public.properties where id = p_property_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;
  if v_property.status not in ('expired', 'paused', 'published', 'sold', 'rented') then
    return jsonb_build_object('ok', false, 'code', 'not_renewable');
  end if;

  update public.properties
     set expires_at      = now() + make_interval(days => public.listing_duration_days()),
         last_renewed_at = now(),
         -- Previously approved listings return to market; anything else has to
         -- pass moderation again.
         status          = case when v_property.published_at is not null then 'published' else 'pending' end
   where id = p_property_id
  returning id, status, expires_at into v_property;

  return jsonb_build_object('ok', true, 'code', 'renewed',
                            'status', v_property.status,
                            'expires_at', v_property.expires_at);
end;
$$;

-- ---------------------------------------------------------------------------
-- Account moderation (§16 Users)
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_account_status(
  p_user_id uuid,
  p_status  public.account_status
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not (public.is_admin() or public.is_service_role()) then
    raise exception 'admin privileges required' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    return jsonb_build_object('ok', false, 'code', 'cannot_modify_self');
  end if;

  update public.profiles set account_status = p_status where id = p_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  -- A suspended seller's listings come off the market immediately.
  if p_status = 'suspended' then
    update public.properties set status = 'paused'
     where seller_id = p_user_id and status = 'published';
  end if;

  return jsonb_build_object('ok', true, 'code', 'updated');
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function public.admin_approve_property(uuid)                                   from public, anon;
revoke all on function public.admin_reject_property(uuid, text)                              from public, anon;
revoke all on function public.admin_set_verification(uuid, public.verification_status, text) from public, anon;
revoke all on function public.admin_set_account_status(uuid, public.account_status)          from public, anon;
revoke all on function public.expire_stale_properties()                                      from public, anon;
revoke all on function public.notify_expiring_properties(integer)                            from public, anon;
revoke all on function public.renew_property(uuid)                                           from public, anon;

-- `authenticated` may *call* these; each one re-checks is_admin() internally,
-- so a non-admin simply gets a 42501.
grant execute on function public.admin_approve_property(uuid)                                   to authenticated;
grant execute on function public.admin_reject_property(uuid, text)                              to authenticated;
grant execute on function public.admin_set_verification(uuid, public.verification_status, text) to authenticated;
grant execute on function public.admin_set_account_status(uuid, public.account_status)          to authenticated;
grant execute on function public.expire_stale_properties()                                      to authenticated;
grant execute on function public.notify_expiring_properties(integer)                            to authenticated;
grant execute on function public.renew_property(uuid)                                           to authenticated;
