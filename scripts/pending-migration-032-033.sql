-- 99Estate PENDING: migrations 032 and 033, plus a one-time repair
--
-- HOW TO RUN THIS
-- Supabase Dashboard, SQL Editor, paste the whole file, press Run. It must be
-- run by something that understands dollar-quoted function bodies. Do NOT
-- feed it to a tool that splits SQL on semicolons.
--
-- Both are here because the order matters and 032 was never applied.
--
-- PART 1  032 - a BEFORE DELETE guard has to return OLD
--         organization_members_guard_write returned NEW on its trusted-writer
--         path. NEW is NULL during a DELETE, and a BEFORE DELETE trigger that
--         returns NULL cancels the row silently. So a platform admin and the
--         service role could never remove a team member, and neither was told.
--         It also broke ON DELETE CASCADE, leaving membership rows behind whose
--         organization was already gone.
--
-- PART 2  the one-time repair of those orphaned rows. Only works after PART 1.
--
-- PART 3  033 - inviting a colleague into a company
--         An owner records an email address, and the invitation becomes a
--         membership when that person signs in with Google on it. There is no
--         mailer in this project, so nothing is sent - accept_pending_
--         invitations() is called from the auth callback instead.
--
-- Safe to run more than once.
--
-- It ends in a SELECT. Every number must be 0.

-- ===========================================================================
-- PART 1  Migration 032
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
-- PART 2  One-time repair: memberships orphaned by the bug in PART 1
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
-- PART 3  Migration 033
-- ===========================================================================

do $$ begin
  create type public.org_invitation_status as enum ('pending', 'accepted', 'revoked');
exception when duplicate_object then null; end $$;

insert into public.app_settings (key, value, description, is_public) values
  ('max_pending_invitations_per_org', '25'::jsonb,
   'How many unanswered invitations one company may have outstanding. Anti-spam.', false),
  ('invitation_validity_days', '30'::jsonb,
   'How long an invitation stays acceptable before it lapses.', false)
on conflict (key) do nothing;

create table if not exists public.organization_invitations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,

  email           text not null,
  role            public.org_member_role not null default 'viewer',
  status          public.org_invitation_status not null default 'pending',

  invited_by      uuid references public.profiles (id) on delete set null,
  accepted_by     uuid references public.profiles (id) on delete set null,

  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  responded_at    timestamptz,

  constraint organization_invitations_email_check
    check (email = lower(email) and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 200),

  constraint organization_invitations_role_check check (role <> 'owner'),
  constraint organization_invitations_responded_check
    check ((status = 'pending') = (responded_at is null))
);

comment on table public.organization_invitations is
  'A seat offered to an email address. Becomes a membership when that person signs in; see accept_pending_invitations().';
comment on column public.organization_invitations.email is
  'Lower-cased. Matched against the address on the JWT, which the identity provider verified — never against anything the invitee typed.';

create unique index if not exists organization_invitations_one_pending_idx
  on public.organization_invitations (organization_id, email)
  where status = 'pending';

create index if not exists organization_invitations_org_idx
  on public.organization_invitations (organization_id, status, created_at desc);

create index if not exists organization_invitations_email_idx
  on public.organization_invitations (email, status)
  where status = 'pending';

create or replace function public.organization_invitations_guard_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_limit   integer;
  v_pending integer;
  v_days    integer;
begin
  if tg_op = 'DELETE' then
    if not (public.is_trusted_writer() or public.is_admin()
            or public.can_manage_org(old.organization_id)) then
      raise exception 'only an owner or admin can withdraw an invitation' using errcode = '42501';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    new.email := lower(trim(new.email));

    if not (public.is_trusted_writer() or public.is_admin()) then
      if not public.can_manage_org(new.organization_id) then
        raise exception 'only an owner or admin can invite a colleague' using errcode = '42501';
      end if;

      new.invited_by  := auth.uid();
      new.accepted_by := null;
      new.status      := 'pending';
      new.responded_at := null;
    end if;

    v_days := public.setting_int('invitation_validity_days', 30);
    new.expires_at := coalesce(new.expires_at, now() + make_interval(days => v_days));

    if exists (
      select 1
      from public.organization_members m
      join public.profiles p on p.id = m.user_id
      where m.organization_id = new.organization_id
        and lower(p.email) = new.email
        and m.status = 'active'
    ) then
      raise exception 'that person is already on the team' using errcode = '23505';
    end if;

    v_limit := public.setting_int('max_pending_invitations_per_org', 25);
    select count(*) into v_pending
    from public.organization_invitations
    where organization_id = new.organization_id and status = 'pending';

    if v_pending >= v_limit then
      raise exception 'you have % invitations outstanding already', v_limit using errcode = '23514';
    end if;

    return new;
  end if;

  if public.is_trusted_writer() or public.is_admin() then
    return new;
  end if;

  if not public.can_manage_org(old.organization_id) then
    raise exception 'only an owner or admin can change an invitation' using errcode = '42501';
  end if;

  if new.organization_id is distinct from old.organization_id
     or new.email is distinct from old.email then
    raise exception 'an invitation cannot be redirected to another company or address'
      using errcode = '42501';
  end if;

  if old.status <> 'pending' then
    raise exception 'that invitation has already been answered' using errcode = '42501';
  end if;

  if new.status not in ('pending', 'revoked') then
    raise exception 'an invitation can only be withdrawn from here' using errcode = '42501';
  end if;

  if new.status = 'revoked' then
    new.responded_at := now();
  end if;

  new.accepted_by := old.accepted_by;
  return new;
end;
$$;

drop trigger if exists organization_invitations_guard_write_trg on public.organization_invitations;
create trigger organization_invitations_guard_write_trg
  before insert or update or delete on public.organization_invitations
  for each row execute function public.organization_invitations_guard_write();

create or replace function public.accept_pending_invitations()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_email   text := lower(nullif(trim(coalesce(auth.jwt() ->> 'email', '')), ''));
  v_invite  record;
  v_joined  integer := 0;
  v_manager record;
  v_name    text;
begin
  if v_uid is null or v_email is null then
    return jsonb_build_object('ok', false, 'code', 'sign_in_required', 'joined', 0);
  end if;

  select full_name into v_name from public.profiles where id = v_uid;

  for v_invite in
    select i.id, i.organization_id, i.role, o.name as org_name
    from public.organization_invitations i
    join public.organizations o on o.id = i.organization_id
    where i.email = v_email
      and i.status = 'pending'
      and i.expires_at > now()

      and o.verification_status <> 'suspended'
  loop
    insert into public.organization_members (organization_id, user_id, role, status)
    values (v_invite.organization_id, v_uid, v_invite.role, 'active')
    on conflict (organization_id, user_id) do nothing;

    update public.organization_invitations
       set status = 'accepted', responded_at = now(), accepted_by = v_uid
     where id = v_invite.id;

    v_joined := v_joined + 1;

    for v_manager in
      select user_id from public.organization_members
      where organization_id = v_invite.organization_id
        and role in ('owner', 'admin')
        and status = 'active'
        and user_id <> v_uid
    loop
      perform public.create_notification(
        v_manager.user_id,
        'Someone joined your team',
        coalesce(v_name, v_email) || ' accepted an invitation to ' || v_invite.org_name || '.',
        'system',
        '/dashboard/organization',
        jsonb_build_object('organization_id', v_invite.organization_id, 'user_id', v_uid)
      );
    end loop;
  end loop;

  return jsonb_build_object('ok', true, 'code', 'processed', 'joined', v_joined);
end;
$$;

alter table public.organization_invitations enable row level security;

drop policy if exists organization_invitations_select on public.organization_invitations;
create policy organization_invitations_select on public.organization_invitations
  for select to authenticated
  using (
    public.is_org_member(organization_id)
    or email = lower(coalesce(auth.jwt() ->> 'email', ''))
    or public.is_admin()
  );

drop policy if exists organization_invitations_insert on public.organization_invitations;
create policy organization_invitations_insert on public.organization_invitations
  for insert to authenticated
  with check (public.can_manage_org(organization_id) or public.is_admin());

drop policy if exists organization_invitations_update on public.organization_invitations;
create policy organization_invitations_update on public.organization_invitations
  for update to authenticated
  using (public.can_manage_org(organization_id) or public.is_admin())
  with check (public.can_manage_org(organization_id) or public.is_admin());

drop policy if exists organization_invitations_delete on public.organization_invitations;
create policy organization_invitations_delete on public.organization_invitations
  for delete to authenticated
  using (public.can_manage_org(organization_id) or public.is_admin());

revoke all on function public.accept_pending_invitations() from public, anon;
grant execute on function public.accept_pending_invitations() to authenticated;

-- ===========================================================================
-- PART 4  Verification. Every number must be 0.
-- ===========================================================================

select
  (
    select count(*)
    from public.organization_members m
    where not exists (select 1 from public.organizations o where o.id = m.organization_id)
  )::int as orphaned_memberships,
  (
    select count(*)
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname = 'organization_members_guard_write'
      and position('if tg_op = ''DELETE'' then' in pg_get_functiondef(p.oid)) = 0
  )::int as guard_missing_delete_branch,
  (
    select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'organization_invitations'
  )::int - 1 as invitations_table_missing,
  (
    select count(*) from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.proname = 'accept_pending_invitations'
  )::int - 1 as accept_function_missing;
