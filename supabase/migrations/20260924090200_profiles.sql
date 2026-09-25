-- ===========================================================================
-- 99Estate — 003 · Profiles
-- ---------------------------------------------------------------------------
-- One row per auth.users row, created automatically on Google sign-up.
-- `mobile_number` is the gate for both posting a property and unlocking a
-- seller contact, and it is the single most privacy-sensitive column in the
-- schema: it is never exposed through the public seller view.
-- ===========================================================================

create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  email               text not null,
  full_name           text,
  -- Stored as a bare 10-digit Indian mobile number; rendered as +91 XXXXX XXXXX.
  mobile_number       text,
  avatar_url          text,
  role                public.user_role not null default 'buyer',
  account_status      public.account_status not null default 'active',

  -- Generated, therefore un-spoofable: a client cannot flip this flag to
  -- bypass the "mobile number required" gate.
  is_profile_complete boolean generated always as (
    mobile_number is not null and char_length(coalesce(full_name, '')) >= 2
  ) stored,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint profiles_email_format_check
    check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint profiles_mobile_format_check
    check (mobile_number is null or mobile_number ~ '^[6-9][0-9]{9}$'),
  constraint profiles_full_name_length_check
    check (full_name is null or char_length(full_name) between 2 and 120)
);

comment on table public.profiles is 'Public-facing user record mirroring auth.users. mobile_number is private.';
comment on column public.profiles.mobile_number is
  'PRIVATE. Never selected into any public API response; revealed only through a successful contact unlock.';

-- One account per phone number keeps lead quality high and blocks trivial
-- multi-account farming of the daily free quota.
create unique index profiles_mobile_number_key
  on public.profiles (mobile_number)
  where mobile_number is not null;

create index profiles_role_idx on public.profiles (role);
create index profiles_created_at_idx on public.profiles (created_at desc);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- --------------------------------------------------------------------------
-- Authorisation helpers
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER so they can read `profiles` from inside RLS policies on
-- `profiles` itself without triggering infinite policy recursion.
-- --------------------------------------------------------------------------
create or replace function public.is_admin(p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = p_uid and role = 'admin' and account_status = 'active'
  );
$$;

-- The role asserted by the request's JWT. Read straight from the PostgREST
-- GUCs rather than auth.role() so it keeps working regardless of which
-- Supabase auth-helper version the project is on.
create or replace function public.jwt_role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  );
$$;

-- TRUE when the caller presented the service-role key.
--
-- Use this inside SECURITY DEFINER functions. `current_user` is useless there
-- (it is always the function owner), but the JWT claim is unaffected by the
-- definer switch, so this stays honest.
create or replace function public.is_service_role()
returns boolean
language sql
stable
as $$
  select coalesce(public.jwt_role(), '') in ('service_role', 'supabase_admin');
$$;

-- TRUE when the *executing database role* is privileged — i.e. we are already
-- running inside a SECURITY DEFINER routine (owner = postgres) or under the
-- service-role connection.
--
-- Use this ONLY in SECURITY INVOKER trigger guards. It is what lets the
-- unlock/notification RPCs write to tables that have no client write path,
-- while a direct request from `authenticated` is still rejected.
--
-- Never call it from a SECURITY DEFINER function: current_user would be the
-- owner and it would always return true.
create or replace function public.is_trusted_writer()
returns boolean
language sql
stable
as $$
  select current_user in ('postgres', 'supabase_admin', 'service_role')
      or public.is_service_role();
$$;

create or replace function public.profile_is_complete(p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_profile_complete and account_status = 'active'
     from public.profiles where id = p_uid),
    false
  );
$$;

-- --------------------------------------------------------------------------
-- Public seller projection
-- ---------------------------------------------------------------------------
-- Business Rule 8 + §8: property pages show who the seller is, never how to
-- reach them. This view is the ONLY sanctioned public read of `profiles`, and
-- it deliberately has no mobile_number / email column to leak.
-- `security_invoker = false` lets it bypass the row policies on profiles,
-- which is safe precisely because the column list is curated.
-- --------------------------------------------------------------------------
create view public.seller_public_profiles
with (security_invoker = false) as
select
  p.id,
  p.full_name,
  p.avatar_url,
  p.role as seller_type,
  p.created_at as member_since
from public.profiles p
where p.account_status = 'active';

comment on view public.seller_public_profiles is
  'Non-sensitive seller fields safe for anonymous reads. Contains no contact information.';

-- Supabase's default privileges grant ALL on new objects in `public` to anon
-- and authenticated. A single-table view like this one is auto-updatable, so
-- leaving that in place would hand anonymous visitors an UPDATE path into
-- `profiles` that bypasses RLS entirely (the view runs as its owner). Revoke
-- everything, then grant back only SELECT.
revoke all on public.seller_public_profiles from public, anon, authenticated;
grant select on public.seller_public_profiles to anon, authenticated;

-- --------------------------------------------------------------------------
-- Privilege-escalation guard
-- ---------------------------------------------------------------------------
-- RLS is row-level, not column-level: a policy that lets a user UPDATE their
-- own profile would also let them set role = 'admin'. This trigger closes
-- that hole and pins the auth-provider-owned columns.
-- --------------------------------------------------------------------------
-- SECURITY INVOKER on purpose: the guard must be able to tell an
-- `authenticated` request apart from a trusted server-side routine, and
-- `current_user` only carries that information when the trigger is *not* a
-- definer function. See is_trusted_writer().
create or replace function public.profiles_guard_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Admin console and trusted server contexts are unrestricted.
  if public.is_trusted_writer() or public.is_admin() or auth.uid() is null then
    return new;
  end if;

  if new.id is distinct from old.id then
    raise exception 'profile id is immutable' using errcode = '42501';
  end if;

  if new.email is distinct from old.email then
    raise exception 'email is managed by the authentication provider' using errcode = '42501';
  end if;

  if new.account_status is distinct from old.account_status then
    raise exception 'account_status can only be changed by an administrator' using errcode = '42501';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'created_at is immutable' using errcode = '42501';
  end if;

  -- Self-service role changes are limited to the buyer <-> owner pair, which
  -- is what "Post Property" flips. agent / builder / admin need onboarding.
  if new.role is distinct from old.role
     and not (old.role in ('buyer', 'owner') and new.role in ('buyer', 'owner')) then
    raise exception 'role "%" can only be granted by an administrator', new.role
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger profiles_guard_write_trg
  before update on public.profiles
  for each row execute function public.profiles_guard_write();

-- --------------------------------------------------------------------------
-- auth.users → profiles synchronisation
-- --------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name   text := nullif(trim(coalesce(
              new.raw_user_meta_data ->> 'full_name',
              new.raw_user_meta_data ->> 'name',
              '')), '');
  v_avatar text := nullif(trim(coalesce(
              new.raw_user_meta_data ->> 'avatar_url',
              new.raw_user_meta_data ->> 'picture',
              '')), '');
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (new.id, new.email, v_name, v_avatar)
  on conflict (id) do update set
    email      = excluded.email,
    -- Never clobber a name the user has edited themselves.
    full_name  = coalesce(profiles.full_name, excluded.full_name),
    avatar_url = coalesce(excluded.avatar_url, profiles.avatar_url);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger on_auth_user_updated
  after update of email, raw_user_meta_data on auth.users
  for each row execute function public.handle_new_user();

-- Backfill for any users that already exist (e.g. re-running against a project
-- where Google sign-in was tested before this migration landed).
insert into public.profiles (id, email, full_name, avatar_url)
select
  u.id,
  u.email,
  nullif(trim(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', '')), ''),
  nullif(trim(coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture', '')), '')
from auth.users u
where u.email is not null
on conflict (id) do nothing;
