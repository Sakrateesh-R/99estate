-- 99Estate PENDING FIX: migration 032, plus a one-time repair it makes possible
--
-- HOW TO RUN THIS
-- Supabase Dashboard, SQL Editor, paste the whole file, press Run. It must be
-- run by something that understands dollar-quoted function bodies. Do NOT feed
-- it to a tool that splits SQL on semicolons.
--
-- WHAT IT FIXES
-- organization_members_guard_write opens with an early return for a caller that
-- needs no checking:
--
--   if public.is_trusted_writer() or public.is_admin() then
--     return new;
--
-- Its trigger is the only guard in the schema that fires on DELETE. During a
-- DELETE, NEW is unassigned and reads as NULL, and a BEFORE DELETE trigger that
-- returns NULL cancels the row operation. Silently: no error, the statement
-- reports success, the row is still there.
--
-- The effect was the reverse of the intent. An owner or admin of the company
-- could remove a member, because that path reaches a correct return old further
-- down. A platform admin could not. The service role could not. Neither was
-- told.
--
-- WHY PART 2 EXISTS
-- The same NULL return also broke ON DELETE CASCADE. Deleting an organization
-- cascades to its memberships, the trigger cancelled each child delete, and the
-- parent delete still succeeded, because PostgreSQL does not re-check the
-- foreign key once a referential action has run. The result is membership rows
-- pointing at an organization that no longer exists.
--
-- Every fixture cleanup in verify-remote.mjs and verify-pages.mjs has been
-- leaving those behind while appearing to succeed. Part 2 clears them. It can
-- only work after Part 1, which is why they are in one file and in this order.
--
-- Safe to run more than once. Part 2 matches nothing on a second run.
--
-- It ends in a SELECT. Both numbers should be 0.

-- ===========================================================================
-- PART 1  The trigger function
-- ===========================================================================

create or replace function public.organization_members_guard_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_trusted_writer() or public.is_admin() then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.user_id is distinct from auth.uid()
       and not public.can_manage_org(old.organization_id) then
      raise exception 'only an owner or admin can remove a team member' using errcode = '42501';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if not public.can_manage_org(new.organization_id) then
      raise exception 'only an owner or admin can add a team member' using errcode = '42501';
    end if;
    new.invited_by := auth.uid();
    return new;
  end if;

  if not public.can_manage_org(old.organization_id) then
    raise exception 'only an owner or admin can change a team member' using errcode = '42501';
  end if;
  if new.organization_id is distinct from old.organization_id
     or new.user_id is distinct from old.user_id then
    raise exception 'a membership cannot be moved to another organization or person'
      using errcode = '42501';
  end if;
  if old.user_id = auth.uid() and (
       new.role   is distinct from old.role
    or new.status is distinct from old.status
  ) then
    raise exception 'you cannot change your own role' using errcode = '42501';
  end if;

  return new;
end;
$$;

-- ===========================================================================
-- PART 2  One-time repair: memberships orphaned by the bug above
-- ===========================================================================

do $$
declare
  n integer;
begin
  select count(*) into n
  from public.organization_members m
  where not exists (select 1 from public.organizations o where o.id = m.organization_id);

  if n = 0 then
    raise notice 'No orphaned memberships. Nothing to repair.';
  else
    delete from public.organization_members m
    where not exists (select 1 from public.organizations o where o.id = m.organization_id);

    raise notice 'Deleted % membership row(s) whose organization no longer exists.', n;
  end if;
end
$$;

-- ===========================================================================
-- PART 3  Verification. Both numbers must be 0.
-- ===========================================================================

select
  (
    select count(*)
    from public.organization_members m
    where not exists (select 1 from public.organizations o where o.id = m.organization_id)
  )::int as orphaned_memberships,
  (
    select count(*)
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.proname = 'organization_members_guard_write'
      and position('if tg_op = ''DELETE'' then' in pg_get_functiondef(p.oid)) = 0
  )::int as guard_still_missing_the_delete_branch;
