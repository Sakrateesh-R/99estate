-- 99Estate PENDING FIX: migration 031, a CASE that lands in an enum needs a cast
--
-- HOW TO RUN THIS
-- Supabase Dashboard, SQL Editor, paste the whole file, press Run. It must be
-- run by something that understands dollar-quoted function bodies. Do NOT
-- feed it to a tool that splits SQL on semicolons.
--
-- WHAT IT FIXES
-- Two functions each assigned an enum column from a CASE whose branches were
-- both bare literals. PostgreSQL resolves such a CASE as text, there is no
-- implicit text to enum cast, so the statement failed at parse time with
-- 42804 and the function threw on every call.
--
--   renew_property                 was broken in production. Both the seller
--                                  renew button and the admin one call it.
--   admin_verify_project_progress  was broken on arrival in migration 029.
--
-- Both function bodies are otherwise reproduced unchanged. The grants are
-- restated so this file is still correct if either function was dropped
-- rather than replaced.
--
-- Safe to run more than once.
--
-- It ends in a SELECT that re-reads both function bodies and reports whether
-- the cast is present. Check that both rows say true before closing the tab.

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

revoke all on function public.renew_property(uuid)                        from public, anon;
revoke all on function public.admin_verify_project_progress(uuid, boolean) from public, anon;

grant execute on function public.renew_property(uuid)                        to authenticated;
grant execute on function public.admin_verify_project_progress(uuid, boolean) to authenticated;

-- Verification. Both rows must report cast_present = true.

select
  p.proname::text as function_name,
  position('::public.property_status' in pg_get_functiondef(p.oid)) > 0
    or position('::public.progress_verification_status' in pg_get_functiondef(p.oid)) > 0
      as cast_present
from pg_proc p
join pg_namespace ns on ns.oid = p.pronamespace
where ns.nspname = 'public'
  and p.proname in ('renew_property', 'admin_verify_project_progress')
order by p.proname;
