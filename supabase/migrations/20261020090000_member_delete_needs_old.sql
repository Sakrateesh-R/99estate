-- ===========================================================================
-- 99Estate — 032 · A BEFORE DELETE guard has to return OLD
-- ---------------------------------------------------------------------------
-- `organization_members_guard_write` opens with the usual early return for a
-- caller that does not need checking:
--
--   if public.is_trusted_writer() or public.is_admin() then
--     return new;
--   end if;
--
-- Its trigger is the only guard in the schema that fires on DELETE as well as
-- INSERT and UPDATE. During a DELETE, `NEW` is unassigned — it reads as NULL —
-- and a BEFORE DELETE trigger that returns NULL **cancels the row operation**.
-- Silently: no error is raised, the statement reports success, and the row is
-- still there.
--
-- So the effect was precisely backwards from the intent:
--
--   an owner or admin of the company   could remove a member (reaches the
--                                      `return old` further down)
--   a platform admin                   could not
--   the service role                   could not
--
-- and neither of the latter two was told. Found while trying to remove a
-- membership with the service role: the DELETE returned an empty result set
-- with no error and the row survived.
--
-- Everything else about the function is reproduced unchanged.
--
-- One further NULL trap fixed while here. The non-trusted DELETE branch read
--
--   if old.user_id <> auth.uid() and not public.can_manage_org(...)
--
-- and `<>` against a NULL `auth.uid()` yields NULL rather than true, so for a
-- session with no user the condition could not fire and the guard fell through
-- to `return old`. Nothing was actually exposed — `organization_members_delete`
-- makes no row visible to `anon` in the first place, so there was nothing to
-- delete — but the guard was relying on RLS to cover a hole rather than being
-- correct on its own. `is distinct from` is NULL-safe and says what was meant.
--
-- Re-runnable: applied by pasting into the Supabase SQL Editor.
-- ===========================================================================

create or replace function public.organization_members_guard_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_trusted_writer() or public.is_admin() then
    -- The fix. `return new` here is NULL on a DELETE, which cancels it.
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    -- Leaving is allowed; removing somebody else needs the manage right.
    -- `is distinct from` rather than `<>`, so a NULL auth.uid() does not make
    -- the whole condition NULL and skip the check.
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

  -- UPDATE
  if not public.can_manage_org(old.organization_id) then
    raise exception 'only an owner or admin can change a team member' using errcode = '42501';
  end if;
  if new.organization_id is distinct from old.organization_id
     or new.user_id is distinct from old.user_id then
    raise exception 'a membership cannot be moved to another organization or person'
      using errcode = '42501';
  end if;
  -- No self-promotion, and no quietly suspending yourself out of a rule.
  if old.user_id = auth.uid() and (
       new.role   is distinct from old.role
    or new.status is distinct from old.status
  ) then
    raise exception 'you cannot change your own role' using errcode = '42501';
  end if;

  return new;
end;
$$;
