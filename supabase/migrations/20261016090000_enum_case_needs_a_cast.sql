-- ===========================================================================
-- 99Estate — 031 · A CASE that lands in an enum column needs a cast
-- ---------------------------------------------------------------------------
-- Two functions each contain an UPDATE of this shape:
--
--   set <enum column> = case when <test> then 'literal_a' else 'literal_b' end
--
-- Both literals are untyped, and PostgreSQL resolves a CASE whose every branch
-- is of unknown type as `text`. There is no implicit text to enum cast, so the
-- statement fails at parse time with
--
--   42804  column "..." is of type ... but expression is of type text
--
-- which means the function throws every single time it is called. Not on an
-- edge case, not for some rows: always.
--
-- The two affected routines:
--
--   renew_property                 shipped broken. Both the seller button in
--                                  lib/properties/actions.ts and the admin one
--                                  in lib/admin/actions.ts call it, so nobody
--                                  has ever successfully renewed a listing.
--
--   admin_verify_project_progress  broken on arrival in migration 029, caught
--                                  by the verification suite before any UI was
--                                  written against it.
--
-- Why neighbouring code of the same shape is fine, which is what makes this
-- easy to miss on a read-through:
--
--   * `set status = case when status = 'created' then 'pending' else status end`
--     in migration 011 works, because the ELSE branch is the enum column
--     itself. That gives the CASE a known type and the literal is coerced to it.
--
--   * `set seller_type = case when new.role = 'buyer' then 'owner'::public.user_role
--     else new.role end` in migration 004 works, because one branch carries an
--     explicit cast.
--
-- So the rule is: a CASE assigned into an enum column must have at least one
-- branch of that enum type, by being a column of it or by carrying a cast.
-- Casting the whole expression, as below, states it once and is the form least
-- likely to be half-applied by a later edit.
--
-- Both functions are otherwise reproduced byte-identically. Nothing else about
-- their behaviour, their guards or their return shapes changes.
--
-- `create or replace function` keeps the existing privileges, but the grants
-- are restated at the end anyway so this file is still correct if either
-- function has been dropped rather than replaced.
--
-- Re-runnable: applied by pasting into the Supabase SQL Editor.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1 · renew_property (§18)
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
         -- pass moderation again. The cast is what makes this statement legal:
         -- both branches are bare literals, so without it the CASE is text.
         status          = (
           case when v_property.published_at is not null then 'published' else 'pending' end
         )::public.property_status
   where id = p_property_id
  returning id, status, expires_at into v_property;

  return jsonb_build_object('ok', true, 'code', 'renewed',
                            'status', v_property.status,
                            'expires_at', v_property.expires_at);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2 · admin_verify_project_progress (§8)
-- ---------------------------------------------------------------------------
create or replace function public.admin_verify_project_progress(
  p_project_id uuid,
  p_verified   boolean default true
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_project record;
begin
  if not (public.is_admin() or public.is_service_role()) then
    raise exception 'admin privileges required' using errcode = '42501';
  end if;

  update public.projects
     set progress_verification = (
           case when p_verified then 'admin_verified' else 'promoter_reported' end
         )::public.progress_verification_status
   where id = p_project_id
  returning id, progress_verification into v_project;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  return jsonb_build_object('ok', true, 'code', 'updated',
                            'project_id', v_project.id,
                            'progress_verification', v_project.progress_verification);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3 · Grants
-- ---------------------------------------------------------------------------
-- Restated rather than relied upon. Note that revoking from `public` alone is
-- not enough on a Supabase project: its default privileges grant EXECUTE on
-- new functions directly to `anon`, which a revoke aimed at PUBLIC does not
-- touch. Both of these name `anon` explicitly.
revoke all on function public.renew_property(uuid)                        from public, anon;
revoke all on function public.admin_verify_project_progress(uuid, boolean) from public, anon;

grant execute on function public.renew_property(uuid)                        to authenticated;
grant execute on function public.admin_verify_project_progress(uuid, boolean) to authenticated;
