-- ===========================================================================
-- 99Estate — 033 · Inviting a colleague into a company (§3)
-- ---------------------------------------------------------------------------
-- Until now only the person who registered a company could act for it. Every
-- role in `org_member_role` existed and every policy resolved through
-- `organization_members`, but there was no way to put a second row in that
-- table — so a builder with a sales team had five roles defined and one usable
-- login.
--
-- The shape of the answer is forced by two facts about this project:
--
--   1 · There is no mailer. No resend, no sendgrid, nothing in package.json,
--       and adding one is a separate decision with its own cost and
--       deliverability problems. So an invitation cannot be a link that gets
--       emailed — it has to work when the invitee simply signs in.
--
--   2 · `organization_members.user_id` is NOT NULL and references `profiles`.
--       A colleague who has never signed in has no profile row, so there is no
--       id to point at. An invitation therefore cannot be a membership row in
--       waiting; it needs a table of its own, keyed by email.
--
-- Hence: an owner or admin records an invitation against an email address, and
-- `accept_pending_invitations()` converts it the moment that person signs in.
-- The app calls that from the auth callback, so by the time they reach the
-- dashboard they are already a member. The owner tells them "sign in at
-- 99estate.in" out of band, which is what a small office does anyway.
--
-- Matching on email is safe here, and only here, because the address comes
-- from the JWT — Google verified it and Supabase recorded it. It is not a
-- value the invitee typed.
--
-- One rule worth stating because it is a deliberate refusal: an invitation
-- cannot grant `owner`. Ownership of a company is transferred in a separate,
-- deliberate act by an existing owner, not handed out in a form where a
-- mistyped address gives away the business. `organization_invitations_role_check`
-- enforces it.
--
-- Re-runnable: applied by pasting into the Supabase SQL Editor.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1 · Enum
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.org_invitation_status as enum ('pending', 'accepted', 'revoked');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 2 · Settings
-- ---------------------------------------------------------------------------
insert into public.app_settings (key, value, description, is_public) values
  ('max_pending_invitations_per_org', '25'::jsonb,
   'How many unanswered invitations one company may have outstanding. Anti-spam.', false),
  ('invitation_validity_days', '30'::jsonb,
   'How long an invitation stays acceptable before it lapses.', false)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 3 · Table
-- ---------------------------------------------------------------------------
create table if not exists public.organization_invitations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,

  -- Stored lower-cased by the guard trigger, because this is matched against
  -- the address on a JWT and `Foo@Gmail.com` is the same person as
  -- `foo@gmail.com`.
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
  -- See the header: ownership is transferred, never invited.
  constraint organization_invitations_role_check check (role <> 'owner'),
  constraint organization_invitations_responded_check
    check ((status = 'pending') = (responded_at is null))
);

comment on table public.organization_invitations is
  'A seat offered to an email address. Becomes a membership when that person signs in; see accept_pending_invitations().';
comment on column public.organization_invitations.email is
  'Lower-cased. Matched against the address on the JWT, which the identity provider verified — never against anything the invitee typed.';

-- One live offer per address per company. Revoked and accepted rows stay as
-- history, so the partial index is what makes re-inviting after a revoke work.
create unique index if not exists organization_invitations_one_pending_idx
  on public.organization_invitations (organization_id, email)
  where status = 'pending';

create index if not exists organization_invitations_org_idx
  on public.organization_invitations (organization_id, status, created_at desc);

-- The lookup `accept_pending_invitations()` does on every sign-in.
create index if not exists organization_invitations_email_idx
  on public.organization_invitations (email, status)
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- 4 · Write guard
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER on purpose — see is_trusted_writer().
--
-- Note the DELETE branch returns OLD. This trigger does not fire on DELETE,
-- but migration 032 exists because the equivalent guard on
-- `organization_members` returned NEW there, which is NULL on a DELETE and
-- silently cancels the row. Written defensively so adding DELETE to the
-- trigger later cannot reintroduce it.
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

      -- Pinned: an invitation is always born pending, and always records who
      -- sent it.
      new.invited_by  := auth.uid();
      new.accepted_by := null;
      new.status      := 'pending';
      new.responded_at := null;
    end if;

    v_days := public.setting_int('invitation_validity_days', 30);
    new.expires_at := coalesce(new.expires_at, now() + make_interval(days => v_days));

    -- Inviting somebody who already works here is not an error worth a form
    -- field, but it must not create a second seat.
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

  -- UPDATE. The only change a person may make is withdrawing an offer; the
  -- accept path runs as a definer routine and is a trusted writer.
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

-- ---------------------------------------------------------------------------
-- 5 · Accepting
-- ---------------------------------------------------------------------------
-- The whole point of the design. Called from the auth callback, so a colleague
-- who signs in for the first time is already a member by the time the
-- dashboard renders.
--
-- SECURITY DEFINER because it writes `organization_members`, which no ordinary
-- caller may insert into for a company they are not yet part of — which is
-- every caller, by definition, at the moment they accept.
--
-- Idempotent, and safe to call on every sign-in: a second run finds nothing
-- pending. `on conflict do nothing` rather than `do update` is deliberate — if
-- somebody is already an active member at a higher role, an old invitation must
-- not quietly demote them.
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
      -- A suspended company cannot recruit.
      and o.verification_status <> 'suspended'
  loop
    insert into public.organization_members (organization_id, user_id, role, status)
    values (v_invite.organization_id, v_uid, v_invite.role, 'active')
    on conflict (organization_id, user_id) do nothing;

    update public.organization_invitations
       set status = 'accepted', responded_at = now(), accepted_by = v_uid
     where id = v_invite.id;

    v_joined := v_joined + 1;

    -- Whoever can act on the team should know it changed.
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

-- ---------------------------------------------------------------------------
-- 6 · Row Level Security
-- ---------------------------------------------------------------------------
alter table public.organization_invitations enable row level security;

-- A member sees their company's invitations; an invitee sees the ones addressed
-- to them, so the dashboard can tell them they have been invited before they
-- have accepted anything.
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

-- ---------------------------------------------------------------------------
-- 7 · Grants
-- ---------------------------------------------------------------------------
revoke all on function public.accept_pending_invitations() from public, anon;
grant execute on function public.accept_pending_invitations() to authenticated;
