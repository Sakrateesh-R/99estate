-- ===========================================================================
-- 99Estate — all migrations, concatenated for the Supabase SQL Editor.
-- Use ONLY on a fresh project. For an existing one, run the newest
-- migration alone (see scripts/pending-migration.sql).
-- Generated from supabase/migrations/*.sql — do not edit directly.
-- ===========================================================================

-- >>> 20260924090000_extensions_and_enums.sql

-- ===========================================================================
-- 99Estate — 001 · Extensions and domain enums
-- ---------------------------------------------------------------------------
-- Every enum used across the schema lives here so downstream migrations can
-- rely on them existing. Enums (rather than free text + CHECK) give us
-- database-level guarantees plus generated TypeScript union types.
-- ===========================================================================

-- gen_random_uuid() is core since PostgreSQL 13, so pgcrypto is not required
-- for primary keys. pg_trgm powers the fuzzy city/locality matching used by
-- search autocomplete. Supabase keeps extensions in the `extensions` schema,
-- which is why the trigram operator classes are qualified as such below.
create extension if not exists "pg_trgm" with schema extensions;

-- --------------------------------------------------------------------------
-- Identity
-- --------------------------------------------------------------------------

-- Everyone starts as `buyer`. Posting a property promotes them to `owner`.
-- `agent` / `builder` arrive via their own onboarding. `admin` is granted
-- out-of-band only (see profiles_guard_write trigger).
create type public.user_role as enum ('buyer', 'owner', 'agent', 'builder', 'admin');

create type public.account_status as enum ('active', 'suspended');

-- --------------------------------------------------------------------------
-- Property taxonomy
-- --------------------------------------------------------------------------

create type public.property_type as enum (
  -- residential
  'apartment',
  'independent_house',
  'villa',
  'builder_floor',
  'penthouse',
  'studio',
  'farmhouse',
  'residential_plot',
  -- commercial
  'office_space',
  'co_working',
  'shop',
  'showroom',
  'warehouse',
  'industrial_land',
  'commercial_plot',
  -- other
  'pg_hostel',
  'agricultural_land'
);

create type public.listing_type as enum ('sale', 'rent', 'pg');

create type public.area_unit as enum (
  'sqft', 'sqm', 'sqyd', 'acre', 'hectare', 'cent', 'guntha', 'bigha', 'marla', 'kanal'
);

create type public.furnishing_status as enum ('unfurnished', 'semi_furnished', 'fully_furnished');

create type public.facing_direction as enum (
  'north', 'south', 'east', 'west', 'north_east', 'north_west', 'south_east', 'south_west'
);

-- draft     → seller is still editing
-- pending   → submitted, waiting on admin moderation
-- published → live and searchable
-- paused    → temporarily hidden by the seller
-- sold/rented → closed by the seller, no longer an active listing
-- expired   → passed expires_at (90 days by default)
-- rejected  → moderation declined it
create type public.property_status as enum (
  'draft', 'pending', 'published', 'paused', 'sold', 'rented', 'expired', 'rejected'
);

create type public.verification_status as enum ('unverified', 'pending', 'verified', 'rejected');

-- --------------------------------------------------------------------------
-- Money & leads
-- --------------------------------------------------------------------------

-- `created` → order opened with the gateway, nothing charged yet.
-- `pending` → gateway is processing / awaiting authorisation.
-- `success` → verified server-side (webhook), the only state that unlocks.
create type public.payment_status as enum ('created', 'pending', 'success', 'failed', 'refunded');

create type public.lead_status as enum (
  'new', 'contacted', 'interested', 'site_visit', 'negotiation', 'closed', 'not_interested'
);

-- --------------------------------------------------------------------------
-- Trust & safety
-- --------------------------------------------------------------------------

create type public.report_reason as enum (
  'fake_property',
  'duplicate',
  'wrong_price',
  'sold_property',
  'wrong_contact',
  'fraud',
  'spam',
  'misleading_information',
  'other'
);

create type public.report_status as enum ('open', 'under_review', 'resolved', 'dismissed');

create type public.notification_type as enum (
  'payment',
  'contact_unlock',
  'property_approved',
  'property_rejected',
  'new_lead',
  'property_expiry',
  'verification',
  'saved_property',
  'system'
);

-- >>> 20260924090100_core_helpers.sql

-- ===========================================================================
-- 99Estate — 002 · Shared helpers and runtime settings
-- ---------------------------------------------------------------------------
-- Timestamp bookkeeping, the IST calendar-day helper that powers the daily
-- free-contact quota, and a small key/value settings table so business
-- constants (free quota, ₹9 price, 90-day listing life) are configurable by
-- admins without a redeploy — while still being read *server-side only*.
-- ===========================================================================

-- --------------------------------------------------------------------------
-- updated_at bookkeeping
-- --------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at is
  'BEFORE UPDATE trigger: stamps updated_at so clients can never backdate it.';

-- --------------------------------------------------------------------------
-- IST calendar day
-- ---------------------------------------------------------------------------
-- Business Rule 10: the free contact quota resets at 00:00 IST — a *calendar*
-- boundary, not a rolling 24h window. Every quota calculation funnels through
-- these two helpers so the rule lives in exactly one place.
-- --------------------------------------------------------------------------
create or replace function public.ist_day_start(p_at timestamptz default now())
returns timestamptz
language sql
stable
as $$
  select date_trunc('day', p_at at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata';
$$;

comment on function public.ist_day_start is
  'Returns the instant of the most recent 00:00 Asia/Kolkata boundary at or before p_at.';

create or replace function public.ist_day_end(p_at timestamptz default now())
returns timestamptz
language sql
stable
as $$
  select public.ist_day_start(p_at) + interval '1 day';
$$;

comment on function public.ist_day_end is
  'Returns the next 00:00 Asia/Kolkata boundary after p_at — i.e. when the free quota resets.';

-- --------------------------------------------------------------------------
-- Slugs (SEO URLs: /property/2bhk-apartment-saravanampatti-coimbatore-<uuid>)
-- --------------------------------------------------------------------------
create or replace function public.slugify(p_text text)
returns text
language sql
immutable
as $$
  select nullif(
    trim(both '-' from regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '-', 'g')),
    ''
  );
$$;

-- --------------------------------------------------------------------------
-- Runtime business settings
-- --------------------------------------------------------------------------
create table public.app_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  -- `is_public` rows may be read by anonymous visitors (e.g. the ₹9 price is
  -- marketing copy). Everything else is server/admin only.
  is_public   boolean not null default false,
  updated_by  uuid,
  updated_at  timestamptz not null default now()
);

create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

insert into public.app_settings (key, value, description, is_public) values
  ('free_daily_unlocks',      '2'::jsonb,     'Free seller-contact unlocks granted per user per IST calendar day.', true),
  ('contact_unlock_price',    '9'::jsonb,     'Price in INR for one contact unlock once the free quota is spent.',  true),
  ('currency',                '"INR"'::jsonb, 'ISO 4217 currency for all contact-unlock payments.',                 true),
  ('listing_duration_days',   '90'::jsonb,    'Days a published listing stays active before it expires.',           true),
  ('max_images_per_property', '15'::jsonb,    'Upload cap per listing.',                                            true);

-- Typed accessors. SECURITY DEFINER so RPCs can read settings regardless of
-- the caller's RLS visibility, and so the *server* always decides the price.
create or replace function public.setting_int(p_key text, p_default integer)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select (value #>> '{}')::integer from public.app_settings where key = p_key), p_default);
$$;

create or replace function public.setting_numeric(p_key text, p_default numeric)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select (value #>> '{}')::numeric from public.app_settings where key = p_key), p_default);
$$;

create or replace function public.setting_text(p_key text, p_default text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select value #>> '{}' from public.app_settings where key = p_key), p_default);
$$;

-- Named business constants — the only sanctioned way to learn these numbers.
create or replace function public.free_daily_unlock_limit()
returns integer language sql stable set search_path = public as $$
  select public.setting_int('free_daily_unlocks', 2);
$$;

create or replace function public.contact_unlock_price()
returns numeric language sql stable set search_path = public as $$
  select public.setting_numeric('contact_unlock_price', 9);
$$;

create or replace function public.default_currency()
returns text language sql stable set search_path = public as $$
  select public.setting_text('currency', 'INR');
$$;

create or replace function public.listing_duration_days()
returns integer language sql stable set search_path = public as $$
  select public.setting_int('listing_duration_days', 90);
$$;

-- --------------------------------------------------------------------------
-- Area normalisation
-- ---------------------------------------------------------------------------
-- Listings are entered in whatever unit the seller thinks in (cent in TN,
-- guntha in MH, marla in PB...). Sorting and range filtering need one
-- comparable number, so every property also stores a generated `area_sqft`.
-- IMMUTABLE — required for use in a generated column.
-- --------------------------------------------------------------------------
create or replace function public.to_sqft(p_area numeric, p_unit public.area_unit)
returns numeric
language sql
immutable
as $$
  select case p_unit
    when 'sqft'    then p_area
    when 'sqm'     then p_area * 10.7639104
    when 'sqyd'    then p_area * 9
    when 'acre'    then p_area * 43560
    when 'hectare' then p_area * 107639.104
    when 'cent'    then p_area * 435.6
    when 'guntha'  then p_area * 1089
    when 'bigha'   then p_area * 27000
    when 'marla'   then p_area * 272.25
    when 'kanal'   then p_area * 5445
  end;
$$;

comment on function public.to_sqft is
  'Converts any supported area unit to square feet so listings are comparable. IMMUTABLE for generated columns.';

-- >>> 20260924090200_profiles.sql

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

-- >>> 20260924090300_properties.sql

-- ===========================================================================
-- 99Estate — 004 · Properties
-- ---------------------------------------------------------------------------
-- The listing table. Posting is free (Business Rule 1) and browsing is free
-- (Rules 2 & 3), so nothing here is paywalled — the money sits one table over
-- in contact_unlocks. What this table *does* enforce is moderation: a seller
-- can submit, pause and close a listing but can never publish it themselves.
-- ===========================================================================

create table public.properties (
  id                  uuid primary key default gen_random_uuid(),
  seller_id           uuid not null references public.profiles (id) on delete cascade,

  -- ---- Listing ----------------------------------------------------------
  title               text not null,
  slug                text,
  description         text,
  property_type       public.property_type not null,
  listing_type        public.listing_type not null,

  -- ---- Commercials ------------------------------------------------------
  price               numeric(14, 2) not null,
  is_negotiable       boolean not null default false,

  -- ---- Dimensions -------------------------------------------------------
  area                numeric(12, 2),
  area_unit           public.area_unit not null default 'sqft',
  -- Normalised so "area low to high" sorting and range filters work across
  -- listings entered in cent, guntha, marla, ...
  area_sqft           numeric(16, 2) generated always as (public.to_sqft(area, area_unit)) stored,

  bedrooms            smallint,
  bathrooms           smallint,
  balconies           smallint,
  floor_number        smallint,
  total_floors        smallint,
  property_age        smallint,
  furnishing_status   public.furnishing_status,
  parking             smallint not null default 0,
  facing              public.facing_direction,

  -- ---- Location ---------------------------------------------------------
  country             text not null default 'India',
  state               text,
  city                text not null,
  locality            text,
  pincode             text,
  address             text,
  latitude            numeric(9, 6),
  longitude           numeric(9, 6),

  -- Mirrored from profiles.role by a trigger. §9 lets buyers filter by seller
  -- type, and an embedded join to `profiles` cannot work for that: RLS hides
  -- other users' profile rows, so an inner join would drop every listing.
  seller_type         public.user_role not null default 'owner',

  -- ---- Lifecycle --------------------------------------------------------
  status              public.property_status not null default 'draft',
  verification_status public.verification_status not null default 'unverified',
  is_featured         boolean not null default false,
  rejection_reason    text,
  published_at        timestamptz,
  expires_at          timestamptz,
  last_renewed_at     timestamptz,

  -- Cover photo URL, mirrored from property_images by a trigger. Without it
  -- every card in a 24-item grid would need its image rows joined in; with it
  -- the listing query stays single-table.
  cover_image_url     text,

  -- ---- Denormalised counters (trigger-maintained; see later migrations) --
  -- The seller dashboard shows views / saves / unlocks / leads per listing.
  -- Counting these live would be four correlated subqueries per row, so they
  -- are kept current by triggers instead.
  views_count         integer not null default 0,
  saves_count         integer not null default 0,
  unlocks_count       integer not null default 0,
  leads_count         integer not null default 0,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- ---- Full-text search -------------------------------------------------
  search_vector       tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(locality, '') || ' ' || coalesce(city, '') || ' ' || coalesce(state, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'D')
  ) stored,

  constraint properties_title_length_check      check (char_length(title) between 8 and 150),
  constraint properties_description_length_check check (description is null or char_length(description) <= 8000),
  constraint properties_price_check             check (price > 0 and price < 1e13),
  constraint properties_area_check              check (area is null or (area > 0 and area < 1e9)),
  constraint properties_bedrooms_check          check (bedrooms is null or bedrooms between 0 and 50),
  constraint properties_bathrooms_check         check (bathrooms is null or bathrooms between 0 and 50),
  constraint properties_balconies_check         check (balconies is null or balconies between 0 and 50),
  constraint properties_parking_check           check (parking between 0 and 50),
  constraint properties_floors_check            check (
    total_floors is null or (total_floors between 0 and 200)
  ),
  constraint properties_floor_number_check      check (
    floor_number is null or (floor_number between -10 and 200)
  ),
  constraint properties_property_age_check      check (property_age is null or property_age between 0 and 200),
  constraint properties_pincode_check           check (pincode is null or pincode ~ '^[1-9][0-9]{5}$'),
  constraint properties_latitude_check          check (latitude is null or latitude between -90 and 90),
  constraint properties_longitude_check         check (longitude is null or longitude between -180 and 180),
  constraint properties_city_check              check (char_length(trim(city)) >= 2),
  -- A published listing must carry an expiry so §18 can retire it.
  constraint properties_published_needs_expiry_check check (
    status <> 'published' or expires_at is not null
  )
);

comment on table public.properties is
  'Property listings. Free to post and free to browse; seller contact is gated separately via contact_unlocks.';
comment on column public.properties.area_sqft is
  'Generated normalisation of (area, area_unit) to square feet for cross-unit sorting and filtering.';
comment on column public.properties.status is
  'Sellers may move draft<->pending and close/pause a listing. Only admins may publish or reject.';

-- --------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
-- The public search only ever reads published rows, so the hot indexes are
-- partial on status = 'published'. That keeps them small even when the table
-- accumulates drafts, expired and closed listings.
-- --------------------------------------------------------------------------
create index properties_seller_idx        on public.properties (seller_id, created_at desc);
create index properties_status_idx        on public.properties (status);
create index properties_expiry_idx        on public.properties (expires_at) where status = 'published';
create index properties_slug_idx          on public.properties (slug);

create index properties_live_recent_idx   on public.properties (published_at desc nulls last) where status = 'published';
create index properties_live_city_idx     on public.properties (lower(city), listing_type, property_type) where status = 'published';
create index properties_live_price_idx    on public.properties (listing_type, price) where status = 'published';
create index properties_live_area_idx     on public.properties (area_sqft) where status = 'published';
create index properties_live_bedrooms_idx on public.properties (bedrooms) where status = 'published';
create index properties_live_featured_idx on public.properties (is_featured, published_at desc) where status = 'published';
create index properties_live_verified_idx on public.properties (verification_status) where status = 'published';
create index properties_live_seller_type_idx on public.properties (seller_type) where status = 'published';

create index properties_search_vector_idx on public.properties using gin (search_vector);
create index properties_city_trgm_idx     on public.properties using gin (city extensions.gin_trgm_ops);
create index properties_locality_trgm_idx on public.properties using gin (locality extensions.gin_trgm_ops);

-- --------------------------------------------------------------------------
-- Derived fields
-- --------------------------------------------------------------------------
create or replace function public.properties_set_derived()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_bhk text := case
    when new.bedrooms is not null and new.bedrooms > 0 then new.bedrooms || 'bhk'
    else null
  end;
begin
  -- SEO slug, e.g. "2bhk-apartment-saravanampatti-coimbatore".
  new.slug := public.slugify(
    concat_ws(' ',
      v_bhk,
      replace(new.property_type::text, '_', ' '),
      case new.listing_type when 'rent' then 'for rent' when 'pg' then 'pg' else 'for sale' end,
      new.locality,
      new.city
    )
  );

  new.country := coalesce(nullif(trim(new.country), ''), 'India');
  new.city    := trim(new.city);

  return new;
end;
$$;

create trigger properties_set_derived_trg
  before insert or update of title, bedrooms, property_type, listing_type, locality, city, country
  on public.properties
  for each row execute function public.properties_set_derived();

create trigger properties_set_updated_at
  before update on public.properties
  for each row execute function public.set_updated_at();

-- --------------------------------------------------------------------------
-- Keep properties.seller_type in step with profiles.role.
-- SECURITY DEFINER because the seller cannot read any profile row but their
-- own, and an admin-created listing must resolve the *seller's* role.
-- --------------------------------------------------------------------------
create or replace function public.properties_sync_seller_type()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select case when p.role = 'buyer' then 'owner'::public.user_role else p.role end
    into new.seller_type
  from public.profiles p
  where p.id = new.seller_id;

  new.seller_type := coalesce(new.seller_type, 'owner');
  return new;
end;
$$;

create trigger properties_sync_seller_type_trg
  before insert or update of seller_id on public.properties
  for each row execute function public.properties_sync_seller_type();

-- When someone is promoted from owner to agent or builder, their existing
-- listings should say so too.
create or replace function public.profiles_propagate_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    update public.properties
       set seller_type = case when new.role = 'buyer' then 'owner'::public.user_role else new.role end
     where seller_id = new.id;
  end if;
  return null;
end;
$$;

create trigger profiles_propagate_role_trg
  after update of role on public.profiles
  for each row execute function public.profiles_propagate_role();

-- --------------------------------------------------------------------------
-- Lifecycle guard
-- ---------------------------------------------------------------------------
-- Enforces §12 ("property enters `pending`, admin approval required before
-- `published`") and §24 ("users must not be able to modify another user's
-- property"). RLS decides *who* may touch the row; this trigger decides
-- *what* they may change on it.
-- --------------------------------------------------------------------------
-- SECURITY INVOKER on purpose — see is_trusted_writer(). A definer trigger
-- here would consider every writer trusted and the moderation gate would be
-- decorative.
create or replace function public.properties_guard_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_trusted boolean := public.is_trusted_writer() or public.is_admin();
begin
  if tg_op = 'INSERT' then
    if not v_trusted then
      -- A seller can only ever create their own listing, as a draft or a
      -- moderation submission. Everything else is server-assigned.
      if new.seller_id is distinct from auth.uid() then
        raise exception 'seller_id must match the authenticated user' using errcode = '42501';
      end if;
      if new.status not in ('draft', 'pending') then
        raise exception 'new listings must start as draft or pending' using errcode = '42501';
      end if;
      new.verification_status := 'unverified';
      new.is_featured         := false;
      new.published_at        := null;
      new.expires_at          := null;
      new.rejection_reason    := null;
      new.cover_image_url     := null;
      new.views_count         := 0;
      new.saves_count         := 0;
      new.unlocks_count       := 0;
      new.leads_count         := 0;
    end if;

  else -- UPDATE
    if not v_trusted then
      if new.seller_id is distinct from old.seller_id then
        raise exception 'ownership cannot be transferred' using errcode = '42501';
      end if;
      if new.verification_status is distinct from old.verification_status then
        raise exception 'verification_status is admin-managed' using errcode = '42501';
      end if;
      if new.is_featured is distinct from old.is_featured then
        raise exception 'is_featured is admin-managed' using errcode = '42501';
      end if;
      if new.rejection_reason is distinct from old.rejection_reason then
        raise exception 'rejection_reason is admin-managed' using errcode = '42501';
      end if;

      -- Counters are trigger-maintained; a seller must not be able to inflate
      -- their own view count.
      -- Derived from the seller's profile, never from the request.
      new.seller_type     := old.seller_type;
      new.views_count     := old.views_count;
      new.saves_count     := old.saves_count;
      new.unlocks_count   := old.unlocks_count;
      new.leads_count     := old.leads_count;
      new.cover_image_url := old.cover_image_url;
      new.created_at      := old.created_at;

      if new.status is distinct from old.status then
        -- Allowed seller-driven transitions only.
        if not (
             (old.status = 'draft'     and new.status in ('pending'))
          or (old.status = 'pending'   and new.status in ('draft'))
          or (old.status = 'published' and new.status in ('paused', 'sold', 'rented'))
          or (old.status = 'paused'    and new.status in ('published', 'sold', 'rented'))
          or (old.status in ('sold', 'rented', 'expired') and new.status in ('paused'))
          or (old.status = 'rejected'  and new.status in ('draft', 'pending'))
        ) then
          raise exception 'sellers cannot move a listing from % to %', old.status, new.status
            using errcode = '42501';
        end if;

        -- Resuming a paused listing only works if it was approved once and the
        -- 90-day window has not run out; otherwise it must be renewed.
        if new.status = 'published' then
          if old.published_at is null then
            raise exception 'listing has not been approved yet' using errcode = '42501';
          end if;
          if old.expires_at is null or old.expires_at <= now() then
            raise exception 'listing has expired — renew it before republishing' using errcode = '42501';
          end if;
        end if;

        -- Material edits to an approved listing send it back for moderation.
      elsif old.status = 'published' and (
             new.title         is distinct from old.title
          or new.description   is distinct from old.description
          or new.price         is distinct from old.price
          or new.property_type is distinct from old.property_type
          or new.listing_type  is distinct from old.listing_type
          or new.city          is distinct from old.city
          or new.locality      is distinct from old.locality
          or new.address       is distinct from old.address
      ) then
        new.status := 'pending';
      end if;
    end if;
  end if;

  -- Publication bookkeeping applies to every writer, including admins.
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    new.published_at := coalesce(new.published_at, now());
    if new.expires_at is null or new.expires_at <= now() then
      new.expires_at := now() + make_interval(days => public.listing_duration_days());
    end if;
    new.rejection_reason := null;
  end if;

  return new;
end;
$$;

create trigger properties_guard_write_trg
  before insert or update on public.properties
  for each row execute function public.properties_guard_write();

-- --------------------------------------------------------------------------
-- Visibility helpers used by RLS on the child tables (images, amenities, ...)
-- and by the contact-unlock RPCs. SECURITY DEFINER to avoid recursive policy
-- evaluation.
-- --------------------------------------------------------------------------
create or replace function public.property_is_live(p_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.properties
    where id = p_property_id
      and status = 'published'
      and (expires_at is null or expires_at > now())
  );
$$;

create or replace function public.owns_property(p_property_id uuid, p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_uid is not null and exists (
    select 1 from public.properties where id = p_property_id and seller_id = p_uid
  );
$$;

create or replace function public.can_view_property(p_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.property_is_live(p_property_id)
      or public.owns_property(p_property_id)
      or public.is_admin()
      or public.is_service_role();
$$;

-- >>> 20260924090400_property_media.sql

-- ===========================================================================
-- 99Estate — 005 · Property images and amenities
-- ---------------------------------------------------------------------------
-- Images live in the public `property-images` Storage bucket under
-- `properties/<property_id>/<file>`; this table is the ordered manifest.
-- ===========================================================================

create table public.property_images (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references public.properties (id) on delete cascade,
  -- Object key inside the `property-images` bucket. Unique so a single object
  -- can never be claimed by two listings.
  storage_path text not null unique,
  public_url   text not null,
  is_cover     boolean not null default false,
  sort_order   smallint not null default 0,
  width        integer,
  height       integer,
  byte_size    integer,
  created_at   timestamptz not null default now(),

  constraint property_images_storage_path_check
    check (storage_path ~ ('^properties/[0-9a-fA-F-]{36}/')),
  constraint property_images_sort_order_check check (sort_order between 0 and 100),
  constraint property_images_byte_size_check  check (byte_size is null or byte_size <= 10 * 1024 * 1024)
);

comment on table public.property_images is
  'Ordered image manifest for a listing. The bytes live in Supabase Storage; this row is the pointer.';

create index property_images_property_idx on public.property_images (property_id, sort_order, created_at);

-- Exactly one cover per listing, enforced by the database rather than by the
-- UI, so "set as cover" can be a simple two-statement update.
create unique index property_images_single_cover_idx
  on public.property_images (property_id)
  where is_cover;

-- --------------------------------------------------------------------------
-- Cap the number of images per listing (§13).
-- --------------------------------------------------------------------------
create or replace function public.property_images_enforce_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := public.setting_int('max_images_per_property', 15);
  v_count integer;
begin
  select count(*) into v_count from public.property_images where property_id = new.property_id;
  if v_count >= v_limit then
    raise exception 'a listing can have at most % images', v_limit using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger property_images_enforce_limit_trg
  before insert on public.property_images
  for each row execute function public.property_images_enforce_limit();

-- --------------------------------------------------------------------------
-- Keep a cover image designated at all times: the first image uploaded becomes
-- the cover, and deleting the cover promotes the next one.
-- --------------------------------------------------------------------------
create or replace function public.property_images_maintain_cover()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if not exists (
      select 1 from public.property_images
      where property_id = new.property_id and is_cover and id <> new.id
    ) then
      update public.property_images set is_cover = true where id = new.id and not is_cover;
    end if;
    return null;
  end if;

  -- DELETE
  if old.is_cover then
    update public.property_images
       set is_cover = true
     where id = (
       select id from public.property_images
       where property_id = old.property_id
       order by sort_order, created_at
       limit 1
     );
  end if;
  return null;
end;
$$;

create trigger property_images_maintain_cover_trg
  after insert or delete on public.property_images
  for each row execute function public.property_images_maintain_cover();

-- --------------------------------------------------------------------------
-- Mirror the cover onto properties.cover_image_url so a 24-card grid is one
-- single-table query instead of a join that drags every image row along.
-- Runs AFTER the cover-maintenance trigger, so it always sees a settled state.
-- --------------------------------------------------------------------------
create or replace function public.property_images_sync_cover_url()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_property_id uuid := coalesce(new.property_id, old.property_id);
begin
  update public.properties p
     set cover_image_url = (
       select i.public_url
       from public.property_images i
       where i.property_id = v_property_id
       order by i.is_cover desc, i.sort_order, i.created_at
       limit 1
     )
   where p.id = v_property_id;

  return null;
end;
$$;

-- Name sorts after `property_images_maintain_cover_trg`; PostgreSQL fires
-- same-event triggers in alphabetical order, so `z_` guarantees this one runs
-- once the cover flag has settled.
create trigger z_property_images_sync_cover_url_trg
  after insert or update of is_cover, sort_order, public_url or delete
  on public.property_images
  for each row execute function public.property_images_sync_cover_url();

-- ===========================================================================
-- Amenities
-- ===========================================================================

create table public.property_amenities (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references public.properties (id) on delete cascade,
  amenity_name text not null,
  created_at   timestamptz not null default now(),

  constraint property_amenities_name_check check (char_length(trim(amenity_name)) between 2 and 60),
  constraint property_amenities_unique unique (property_id, amenity_name)
);

create index property_amenities_property_idx on public.property_amenities (property_id);
-- Supports "listings with a lift + covered parking" style filtering.
create index property_amenities_name_idx on public.property_amenities (amenity_name);

-- >>> 20260924090500_engagement.sql

-- ===========================================================================
-- 99Estate — 006 · Saved properties and view tracking
-- ---------------------------------------------------------------------------
-- Both feed the seller dashboard counters. Views are de-duplicated per
-- visitor per IST day so the number means "people", not "page loads".
-- ===========================================================================

create table public.saved_properties (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  created_at  timestamptz not null default now(),

  -- §14: prevent duplicate saves.
  constraint saved_properties_unique unique (user_id, property_id)
);

create index saved_properties_user_idx on public.saved_properties (user_id, created_at desc);
create index saved_properties_property_idx on public.saved_properties (property_id);

-- ===========================================================================
-- Views
-- ===========================================================================

create table public.property_views (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references public.properties (id) on delete cascade,
  -- Null for signed-out visitors; they are identified by visitor_hash only.
  viewer_id    uuid references public.profiles (id) on delete set null,
  -- Salted hash of (ip + user agent). Deliberately not reversible — we only
  -- need it to collapse repeat views, never to identify a person.
  visitor_hash text not null,
  viewed_on    date not null default (now() at time zone 'Asia/Kolkata')::date,
  created_at   timestamptz not null default now()
);

comment on table public.property_views is
  'One row per unique visitor per listing per IST day. Written only through record_property_view().';

create unique index property_views_dedupe_idx
  on public.property_views (property_id, visitor_hash, viewed_on);
create index property_views_property_idx on public.property_views (property_id, viewed_on desc);
create index property_views_viewer_idx on public.property_views (viewer_id, created_at desc);

-- --------------------------------------------------------------------------
-- Counter maintenance
-- --------------------------------------------------------------------------
create or replace function public.saved_properties_sync_counter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.properties set saves_count = saves_count + 1 where id = new.property_id;
  else
    update public.properties set saves_count = greatest(0, saves_count - 1) where id = old.property_id;
  end if;
  return null;
end;
$$;

create trigger saved_properties_sync_counter_trg
  after insert or delete on public.saved_properties
  for each row execute function public.saved_properties_sync_counter();

create or replace function public.property_views_sync_counter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.properties set views_count = views_count + 1 where id = new.property_id;
  return null;
end;
$$;

create trigger property_views_sync_counter_trg
  after insert on public.property_views
  for each row execute function public.property_views_sync_counter();

-- --------------------------------------------------------------------------
-- The only sanctioned way to record a view. There is no INSERT policy on
-- property_views, so a client cannot inflate a competitor's — or its own —
-- view count by posting rows directly.
-- --------------------------------------------------------------------------
create or replace function public.record_property_view(
  p_property_id  uuid,
  p_visitor_hash text
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if p_property_id is null or coalesce(trim(p_visitor_hash), '') = '' then
    return;
  end if;

  -- Only live listings accrue views, and a seller viewing their own listing
  -- does not count.
  if not public.property_is_live(p_property_id) then
    return;
  end if;
  if public.owns_property(p_property_id) then
    return;
  end if;

  insert into public.property_views (property_id, viewer_id, visitor_hash)
  values (p_property_id, auth.uid(), left(p_visitor_hash, 128))
  on conflict (property_id, visitor_hash, viewed_on) do nothing;
end;
$$;

revoke all on function public.record_property_view(uuid, text) from public;
grant execute on function public.record_property_view(uuid, text) to anon, authenticated;

-- >>> 20260924090600_notifications_and_reports.sql

-- ===========================================================================
-- 99Estate — 007 · Notifications and property reports
-- ---------------------------------------------------------------------------
-- Notifications are created earlier in the migration order than leads and
-- unlocks because those tables' triggers write into this one.
-- ===========================================================================

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  title      text not null,
  message    text,
  type       public.notification_type not null default 'system',
  -- Deep link into the app, e.g. /dashboard/leads or /property/<slug>-<id>.
  link       text,
  -- Extra payload for rendering (property id, amount, ...). Never secrets.
  data       jsonb not null default '{}'::jsonb,
  is_read    boolean not null default false,
  created_at timestamptz not null default now(),

  constraint notifications_title_check check (char_length(trim(title)) between 2 and 160),
  constraint notifications_message_check check (message is null or char_length(message) <= 1000),
  constraint notifications_link_check check (link is null or link ~ '^/')
);

-- The bell menu reads "my unread, newest first" on nearly every page load.
create index notifications_inbox_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where not is_read;

-- Single writer for every in-app notification. SECURITY DEFINER because the
-- callers (triggers, RPCs, webhooks) act on behalf of *another* user — a buyer
-- unlocking a contact causes a notification row owned by the seller.
create or replace function public.create_notification(
  p_user_id uuid,
  p_title   text,
  p_message text default null,
  p_type    public.notification_type default 'system',
  p_link    text default null,
  p_data    jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_user_id is null then
    return null;
  end if;

  insert into public.notifications (user_id, title, message, type, link, data)
  values (p_user_id, left(p_title, 160), left(p_message, 1000), p_type, p_link, coalesce(p_data, '{}'::jsonb))
  returning id into v_id;

  return v_id;
end;
$$;

-- Not callable from the browser: clients must never be able to forge a
-- "Payment successful" notification.
revoke all on function public.create_notification(uuid, text, text, public.notification_type, text, jsonb) from public, anon, authenticated;

-- ===========================================================================
-- Property reports (§17)
-- ===========================================================================

create table public.property_reports (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason      public.report_reason not null,
  description text,
  status      public.report_status not null default 'open',
  admin_notes text,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint property_reports_description_check check (description is null or char_length(description) <= 2000),
  -- "Other" is only actionable with an explanation.
  constraint property_reports_other_needs_detail_check
    check (reason <> 'other' or char_length(coalesce(trim(description), '')) >= 10),
  -- One open report per person per listing; stops report-bombing.
  constraint property_reports_unique_reporter unique (property_id, reporter_id)
);

create index property_reports_property_idx on public.property_reports (property_id, created_at desc);
create index property_reports_queue_idx on public.property_reports (status, created_at desc);
create index property_reports_reporter_idx on public.property_reports (reporter_id, created_at desc);

create trigger property_reports_set_updated_at
  before update on public.property_reports
  for each row execute function public.set_updated_at();

-- Reporters may file; only admins may triage.
-- SECURITY INVOKER on purpose — see is_trusted_writer().
create or replace function public.property_reports_guard_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_trusted_writer() or public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.reporter_id is distinct from auth.uid() then
      raise exception 'reporter_id must match the authenticated user' using errcode = '42501';
    end if;
    if public.owns_property(new.property_id) then
      raise exception 'you cannot report your own listing' using errcode = '42501';
    end if;
    new.status      := 'open';
    new.admin_notes := null;
    new.resolved_by := null;
    new.resolved_at := null;
    return new;
  end if;

  raise exception 'reports can only be updated by an administrator' using errcode = '42501';
end;
$$;

create trigger property_reports_guard_write_trg
  before insert or update on public.property_reports
  for each row execute function public.property_reports_guard_write();

-- >>> 20260924090700_contact_unlocks_payments_leads.sql

-- ===========================================================================
-- 99Estate — 008 · Contact unlocks, payments and leads
-- ---------------------------------------------------------------------------
-- The commercial core. Three invariants drive every constraint here:
--
--   Rule 4  exactly 2 free unlocks per user per IST calendar day
--   Rule 6  unlocking the same property twice never charges again
--   Rule 7  an unlock only exists after server-side authorisation/verification
--
-- Consequently there is *no* client INSERT path to any of these tables (see
-- the RLS migration). Rows appear only through SECURITY DEFINER RPCs.
-- ===========================================================================

create table public.contact_unlocks (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  property_id    uuid not null references public.properties (id) on delete cascade,
  -- Denormalised from properties.seller_id: the lead must survive even if the
  -- listing is later reassigned, and it keeps seller-side queries single-table.
  seller_id      uuid not null references public.profiles (id) on delete cascade,
  amount         numeric(10, 2) not null default 0,
  currency       text not null default 'INR',
  is_free        boolean not null,
  payment_id     uuid,
  payment_status public.payment_status not null default 'success',
  unlocked_at    timestamptz not null default now(),
  created_at     timestamptz not null default now(),

  -- A free unlock is always ₹0 and a paid unlock is always > ₹0. Prevents a
  -- "free" row being written with a price, or a paid row being written as ₹0.
  constraint contact_unlocks_amount_matches_kind_check
    check ((is_free and amount = 0) or (not is_free and amount > 0)),
  constraint contact_unlocks_free_is_settled_check
    check (not is_free or payment_status = 'success'),
  constraint contact_unlocks_not_own_listing_check check (user_id <> seller_id),
  constraint contact_unlocks_currency_check check (currency = upper(currency) and char_length(currency) = 3)
);

comment on table public.contact_unlocks is
  'One row per (buyer, property) contact reveal. Written only by SECURITY DEFINER RPCs — never by a client.';

-- Rule 6, enforced by the database: a buyer can hold at most one settled
-- unlock per listing, so a second attempt can never be charged. Partial on
-- `success` so a refunded unlock could legitimately be re-purchased later.
create unique index contact_unlocks_one_settled_per_property_idx
  on public.contact_unlocks (user_id, property_id)
  where payment_status = 'success';

-- Rule 4's daily count: "successful unlocks for this user in this IST window".
create index contact_unlocks_daily_quota_idx
  on public.contact_unlocks (user_id, unlocked_at desc)
  where payment_status = 'success';

create index contact_unlocks_seller_idx on public.contact_unlocks (seller_id, unlocked_at desc);
create index contact_unlocks_property_idx on public.contact_unlocks (property_id, unlocked_at desc);
-- Admin revenue reporting: free vs paid split over time.
create index contact_unlocks_revenue_idx on public.contact_unlocks (is_free, unlocked_at desc);

-- ===========================================================================
-- Payments
-- ===========================================================================

create table public.payments (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles (id) on delete cascade,
  property_id         uuid references public.properties (id) on delete set null,
  contact_unlock_id   uuid,
  -- Authoritative amount, always computed server-side from app_settings.
  amount              numeric(10, 2) not null,
  currency            text not null default 'INR',
  provider            text not null,
  provider_order_id   text,
  provider_payment_id text,
  status              public.payment_status not null default 'created',
  failure_reason      text,
  -- Gateway payloads for reconciliation. Never contains card data.
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint payments_amount_check check (amount >= 0 and amount < 1e7),
  constraint payments_currency_check check (currency = upper(currency) and char_length(currency) = 3),
  constraint payments_provider_check check (char_length(trim(provider)) between 2 and 40)
);

comment on table public.payments is
  'Gateway transaction ledger. `status` only reaches success through a signature-verified webhook.';

-- Idempotency keys for the webhook: replaying the same gateway event must not
-- create a second payment row or a second unlock.
create unique index payments_provider_order_idx
  on public.payments (provider, provider_order_id) where provider_order_id is not null;
create unique index payments_provider_payment_idx
  on public.payments (provider, provider_payment_id) where provider_payment_id is not null;

create index payments_user_idx on public.payments (user_id, created_at desc);
create index payments_status_idx on public.payments (status, created_at desc);
create index payments_property_idx on public.payments (property_id);

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

-- The two tables reference each other, so the foreign keys are added after
-- both exist. Both sides are nullable, so there is no chicken-and-egg insert.
alter table public.contact_unlocks
  add constraint contact_unlocks_payment_id_fkey
  foreign key (payment_id) references public.payments (id) on delete set null;

alter table public.payments
  add constraint payments_contact_unlock_id_fkey
  foreign key (contact_unlock_id) references public.contact_unlocks (id) on delete set null;

-- A paid unlock must point at the payment that settled it.
alter table public.contact_unlocks
  add constraint contact_unlocks_paid_needs_payment_check
  check (is_free or payment_id is not null) not valid;
alter table public.contact_unlocks validate constraint contact_unlocks_paid_needs_payment_check;

-- ===========================================================================
-- Leads (Rule 9: every successful unlock creates one)
-- ===========================================================================

create table public.leads (
  id                    uuid primary key default gen_random_uuid(),
  property_id           uuid not null references public.properties (id) on delete cascade,
  seller_id             uuid not null references public.profiles (id) on delete cascade,
  buyer_id              uuid not null references public.profiles (id) on delete cascade,
  -- 1:1 with the unlock that produced it — the unique constraint is what makes
  -- lead creation idempotent under webhook replay.
  contact_unlock_id     uuid not null unique references public.contact_unlocks (id) on delete cascade,
  status                public.lead_status not null default 'new',
  notes                 text,
  last_status_change_at timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint leads_notes_check check (notes is null or char_length(notes) <= 2000),
  constraint leads_not_self_check check (buyer_id <> seller_id)
);

create index leads_seller_idx on public.leads (seller_id, created_at desc);
create index leads_seller_status_idx on public.leads (seller_id, status, created_at desc);
create index leads_buyer_idx on public.leads (buyer_id, created_at desc);
create index leads_property_idx on public.leads (property_id, created_at desc);

create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

-- A seller owns the pipeline state of their lead and nothing else about it.
-- SECURITY INVOKER on purpose — see is_trusted_writer(). This is what makes
-- "leads are created automatically" enforceable: request_contact_unlock() is a
-- definer routine so its INSERT passes, a direct client INSERT does not.
create or replace function public.leads_guard_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_trusted_writer() or public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'leads are created automatically by a contact unlock' using errcode = '42501';
  end if;

  if auth.uid() is distinct from old.seller_id then
    raise exception 'only the listing owner can update this lead' using errcode = '42501';
  end if;

  if new.property_id       is distinct from old.property_id
     or new.seller_id      is distinct from old.seller_id
     or new.buyer_id       is distinct from old.buyer_id
     or new.contact_unlock_id is distinct from old.contact_unlock_id
     or new.created_at     is distinct from old.created_at then
    raise exception 'only status and notes can be updated on a lead' using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    new.last_status_change_at := now();
  end if;

  return new;
end;
$$;

create trigger leads_guard_write_trg
  before insert or update on public.leads
  for each row execute function public.leads_guard_write();

-- ---------------------------------------------------------------------------
-- Dashboard counters
-- ---------------------------------------------------------------------------
create or replace function public.contact_unlocks_sync_counter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.properties set unlocks_count = unlocks_count + 1 where id = new.property_id;
  elsif tg_op = 'DELETE' then
    update public.properties set unlocks_count = greatest(0, unlocks_count - 1) where id = old.property_id;
  end if;
  return null;
end;
$$;

create trigger contact_unlocks_sync_counter_trg
  after insert or delete on public.contact_unlocks
  for each row execute function public.contact_unlocks_sync_counter();

create or replace function public.leads_sync_counter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.properties set leads_count = leads_count + 1 where id = new.property_id;
  elsif tg_op = 'DELETE' then
    update public.properties set leads_count = greatest(0, leads_count - 1) where id = old.property_id;
  end if;
  return null;
end;
$$;

create trigger leads_sync_counter_trg
  after insert or delete on public.leads
  for each row execute function public.leads_sync_counter();

-- >>> 20260924090800_catalog.sql

-- ===========================================================================
-- 99Estate — 009 · Admin-managed catalogue
-- ---------------------------------------------------------------------------
-- Supported locations (§16 Locations), browse-by-category tiles (§16
-- Categories), the amenity vocabulary used by the posting form, and the
-- verification queue (§16 Verification).
-- ===========================================================================

create table public.locations (
  id         uuid primary key default gen_random_uuid(),
  country    text not null default 'India',
  state      text not null,
  city       text not null,
  -- Null row = the city itself; non-null = a locality inside that city.
  locality   text,
  pincode    text,
  latitude   numeric(9, 6),
  longitude  numeric(9, 6),
  is_active  boolean not null default true,
  is_popular boolean not null default false,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint locations_pincode_check check (pincode is null or pincode ~ '^[1-9][0-9]{5}$')
);

-- `coalesce` keeps the city-level row (locality is null) unique too, which a
-- plain UNIQUE(city, locality) would not do.
create unique index locations_unique_idx
  on public.locations (lower(country), lower(state), lower(city), lower(coalesce(locality, '')));
create index locations_city_idx on public.locations (lower(city)) where is_active;
create index locations_popular_idx on public.locations (is_popular, sort_order) where is_active;

create trigger locations_set_updated_at
  before update on public.locations
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- Browse-by-type tiles
-- ===========================================================================

create table public.property_categories (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  label         text not null,
  description   text,
  -- Which listing types this tile collects. Empty = all of them.
  property_types public.property_type[] not null default '{}',
  listing_types  public.listing_type[] not null default '{}',
  -- lucide-react icon name rendered by the UI.
  icon          text,
  is_active     boolean not null default true,
  sort_order    smallint not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint property_categories_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create index property_categories_active_idx on public.property_categories (is_active, sort_order);

create trigger property_categories_set_updated_at
  before update on public.property_categories
  for each row execute function public.set_updated_at();

insert into public.property_categories (slug, label, property_types, icon, sort_order) values
  ('apartments',      'Apartments',        '{apartment,builder_floor,penthouse,studio}',            'Building2', 10),
  ('independent-homes','Independent Homes', '{independent_house,villa,farmhouse}',                   'Home',      20),
  ('plots-land',      'Plots & Land',      '{residential_plot,commercial_plot,agricultural_land}',  'LandPlot',  30),
  ('commercial',      'Commercial',        '{office_space,co_working,shop,showroom}',               'Store',     40),
  ('industrial',      'Industrial',        '{warehouse,industrial_land}',                           'Factory',   50),
  ('pg-coliving',     'PG & Co-living',    '{pg_hostel}',                                           'BedDouble', 60);

-- ===========================================================================
-- Amenity vocabulary
-- ===========================================================================

create table public.amenities (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  category   text not null default 'general',
  icon       text,
  is_active  boolean not null default true,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

create index amenities_active_idx on public.amenities (is_active, category, sort_order);

insert into public.amenities (name, category, icon, sort_order) values
  ('Lift',                  'building',  'ArrowUpDown',   10),
  ('Power Backup',          'building',  'BatteryCharging', 20),
  ('24x7 Water Supply',     'building',  'Droplets',      30),
  ('Covered Parking',       'parking',   'CarFront',      40),
  ('Visitor Parking',       'parking',   'Car',           50),
  ('Security',              'safety',    'ShieldCheck',   60),
  ('CCTV Surveillance',     'safety',    'Cctv',          70),
  ('Fire Safety',           'safety',    'Flame',         80),
  ('Gated Community',       'safety',    'Fence',         90),
  ('Gymnasium',             'lifestyle', 'Dumbbell',     100),
  ('Swimming Pool',         'lifestyle', 'Waves',        110),
  ('Clubhouse',             'lifestyle', 'Martini',      120),
  ('Children''s Play Area', 'lifestyle', 'ToyBrick',     130),
  ('Park / Garden',         'lifestyle', 'Trees',        140),
  ('Jogging Track',         'lifestyle', 'Footprints',   150),
  ('Rainwater Harvesting',  'utility',   'CloudRain',    160),
  ('Sewage Treatment',      'utility',   'Recycle',      170),
  ('Piped Gas',             'utility',   'Flame',        180),
  ('Internet / Wi-Fi',      'utility',   'Wifi',         190),
  ('Modular Kitchen',       'interior',  'CookingPot',   200),
  ('Wardrobes',             'interior',  'Shirt',        210),
  ('Air Conditioning',      'interior',  'AirVent',      220),
  ('Vastu Compliant',       'general',   'Compass',      230),
  ('Pet Friendly',          'general',   'PawPrint',     240),
  ('Wheelchair Accessible', 'general',   'Accessibility',250);

-- ===========================================================================
-- Verification queue (§16 Verification)
-- ===========================================================================

create table public.verification_requests (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  seller_id   uuid not null references public.profiles (id) on delete cascade,
  -- Object keys inside a private bucket; never served publicly.
  documents   jsonb not null default '[]'::jsonb,
  note        text,
  status      public.verification_status not null default 'pending',
  admin_notes text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint verification_requests_note_check check (note is null or char_length(note) <= 1000)
);

-- At most one request awaiting review per listing.
create unique index verification_requests_open_idx
  on public.verification_requests (property_id)
  where status = 'pending';
create index verification_requests_queue_idx on public.verification_requests (status, created_at desc);
create index verification_requests_seller_idx on public.verification_requests (seller_id, created_at desc);

create trigger verification_requests_set_updated_at
  before update on public.verification_requests
  for each row execute function public.set_updated_at();

-- SECURITY INVOKER on purpose — see is_trusted_writer().
create or replace function public.verification_requests_guard_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_trusted_writer() or public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if not public.owns_property(new.property_id) then
      raise exception 'you can only request verification for your own listing' using errcode = '42501';
    end if;
    new.seller_id   := auth.uid();
    new.status      := 'pending';
    new.admin_notes := null;
    new.reviewed_by := null;
    new.reviewed_at := null;
    return new;
  end if;

  raise exception 'verification requests are reviewed by administrators' using errcode = '42501';
end;
$$;

create trigger verification_requests_guard_write_trg
  before insert or update on public.verification_requests
  for each row execute function public.verification_requests_guard_write();

-- ===========================================================================
-- Seed a few popular locations so search has something to autocomplete on
-- day one. Admins manage the rest from /admin/locations.
-- ===========================================================================
insert into public.locations (state, city, is_popular, sort_order) values
  ('Tamil Nadu',    'Chennai',    true, 10),
  ('Tamil Nadu',    'Coimbatore', true, 20),
  ('Karnataka',     'Bengaluru',  true, 30),
  ('Telangana',     'Hyderabad',  true, 40),
  ('Maharashtra',   'Mumbai',     true, 50),
  ('Maharashtra',   'Pune',       true, 60),
  ('Delhi',         'New Delhi',  true, 70),
  ('Haryana',       'Gurugram',   true, 80),
  ('Uttar Pradesh', 'Noida',      true, 90),
  ('West Bengal',   'Kolkata',    true, 100),
  ('Gujarat',       'Ahmedabad',  true, 110),
  ('Kerala',        'Kochi',      true, 120)
on conflict do nothing;

-- >>> 20260924090900_row_level_security.sql

-- ===========================================================================
-- 99Estate — 010 · Row Level Security
-- ---------------------------------------------------------------------------
-- Supabase grants anon/authenticated broad table privileges by default, so RLS
-- is the real access control layer. The shape of this file is deliberate:
--
--   * Tables a user owns          → self-service policies keyed on auth.uid()
--   * Tables that represent money → SELECT only; every write goes through a
--                                   SECURITY DEFINER RPC (Rules 5, 6, 7)
--   * Private columns across users→ exposed through curated views, never by
--                                   loosening a row policy (Rule 8)
--
-- A table with RLS enabled and no policy for a command denies that command.
-- That "deny by omission" is how contact_unlocks, payments and leads stay
-- un-forgeable from the browser.
-- ===========================================================================

alter table public.profiles              enable row level security;
alter table public.properties            enable row level security;
alter table public.property_images       enable row level security;
alter table public.property_amenities    enable row level security;
alter table public.saved_properties      enable row level security;
alter table public.property_views        enable row level security;
alter table public.contact_unlocks       enable row level security;
alter table public.payments              enable row level security;
alter table public.leads                 enable row level security;
alter table public.property_reports      enable row level security;
alter table public.notifications         enable row level security;
alter table public.app_settings          enable row level security;
alter table public.locations             enable row level security;
alter table public.property_categories   enable row level security;
alter table public.amenities             enable row level security;
alter table public.verification_requests enable row level security;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
-- Only ever your own row. Other people's names/avatars come from the
-- seller_public_profiles view, which has no contact columns to leak.
create policy profiles_select_self on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

create policy profiles_insert_self on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- properties
-- ---------------------------------------------------------------------------
-- Rule 2/3: browsing is free and anonymous. Expired listings drop out of the
-- public result set here (§18) rather than in every query.
create policy properties_select_published on public.properties
  for select to anon, authenticated
  using (status = 'published' and (expires_at is null or expires_at > now()));

create policy properties_select_own on public.properties
  for select to authenticated
  using (seller_id = auth.uid() or public.is_admin());

-- §2: a mobile number is mandatory before posting. The generated
-- is_profile_complete column behind profile_is_complete() cannot be spoofed.
create policy properties_insert_own on public.properties
  for insert to authenticated
  with check (seller_id = auth.uid() and public.profile_is_complete());

create policy properties_update_own on public.properties
  for update to authenticated
  using (seller_id = auth.uid() or public.is_admin())
  with check (seller_id = auth.uid() or public.is_admin());

create policy properties_delete_own on public.properties
  for delete to authenticated
  using (seller_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- property_images / property_amenities
-- ---------------------------------------------------------------------------
-- Visibility follows the parent listing; writes follow ownership.
create policy property_images_select on public.property_images
  for select to anon, authenticated
  using (public.can_view_property(property_id));

create policy property_images_write on public.property_images
  for all to authenticated
  using (public.owns_property(property_id) or public.is_admin())
  with check (public.owns_property(property_id) or public.is_admin());

create policy property_amenities_select on public.property_amenities
  for select to anon, authenticated
  using (public.can_view_property(property_id));

create policy property_amenities_write on public.property_amenities
  for all to authenticated
  using (public.owns_property(property_id) or public.is_admin())
  with check (public.owns_property(property_id) or public.is_admin());

-- ---------------------------------------------------------------------------
-- saved_properties (§14)
-- ---------------------------------------------------------------------------
create policy saved_properties_own on public.saved_properties
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.property_is_live(property_id));

-- ---------------------------------------------------------------------------
-- property_views — analytics for the listing owner. No INSERT policy: rows
-- arrive exclusively through record_property_view().
-- ---------------------------------------------------------------------------
create policy property_views_select_owner on public.property_views
  for select to authenticated
  using (public.owns_property(property_id) or public.is_admin());

-- ---------------------------------------------------------------------------
-- contact_unlocks — SELECT ONLY.
-- ---------------------------------------------------------------------------
-- Deliberately no INSERT/UPDATE/DELETE policy. This is what makes "Fake
-- contact unlocks" and "Give themselves free unlocks" (§24) impossible: the
-- only writer is request_contact_unlock() / settle_paid_contact_unlock(),
-- both SECURITY DEFINER and both re-deriving the price server-side.
create policy contact_unlocks_select_participants on public.contact_unlocks
  for select to authenticated
  using (user_id = auth.uid() or seller_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- payments — SELECT ONLY, same reasoning (§24 "Modify payment records").
-- ---------------------------------------------------------------------------
create policy payments_select_own on public.payments
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- leads — sellers own the pipeline; buyers can see the leads they generated.
-- No INSERT policy: leads are a side effect of an unlock (Rule 9).
-- ---------------------------------------------------------------------------
create policy leads_select_participants on public.leads
  for select to authenticated
  using (seller_id = auth.uid() or buyer_id = auth.uid() or public.is_admin());

create policy leads_update_seller on public.leads
  for update to authenticated
  using (seller_id = auth.uid() or public.is_admin())
  with check (seller_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- property_reports (§17)
-- ---------------------------------------------------------------------------
create policy property_reports_insert_self on public.property_reports
  for insert to authenticated
  with check (reporter_id = auth.uid());

create policy property_reports_select_own on public.property_reports
  for select to authenticated
  using (reporter_id = auth.uid() or public.is_admin());

create policy property_reports_update_admin on public.property_reports
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- notifications — read + mark-as-read + dismiss. Creation is server-side only.
-- ---------------------------------------------------------------------------
create policy notifications_select_own on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy notifications_delete_own on public.notifications
  for delete to authenticated
  using (user_id = auth.uid());

-- Marking as read is the only field a recipient may change; they must not be
-- able to rewrite the text of a notification they were sent.
-- SECURITY INVOKER on purpose — see is_trusted_writer().
create or replace function public.notifications_guard_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_trusted_writer() or public.is_admin() then
    return new;
  end if;
  new.user_id    := old.user_id;
  new.title      := old.title;
  new.message    := old.message;
  new.type       := old.type;
  new.link       := old.link;
  new.data       := old.data;
  new.created_at := old.created_at;
  return new;
end;
$$;

create trigger notifications_guard_write_trg
  before update on public.notifications
  for each row execute function public.notifications_guard_write();

-- ---------------------------------------------------------------------------
-- app_settings — public constants are readable (the ₹9 price is marketing
-- copy); everything else, and every write, is admin-only.
-- ---------------------------------------------------------------------------
create policy app_settings_select_public on public.app_settings
  for select to anon, authenticated
  using (is_public or public.is_admin());

create policy app_settings_write_admin on public.app_settings
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Catalogue tables — public read of active rows, admin write.
-- ---------------------------------------------------------------------------
create policy locations_select_active on public.locations
  for select to anon, authenticated using (is_active or public.is_admin());
create policy locations_write_admin on public.locations
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy property_categories_select_active on public.property_categories
  for select to anon, authenticated using (is_active or public.is_admin());
create policy property_categories_write_admin on public.property_categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy amenities_select_active on public.amenities
  for select to anon, authenticated using (is_active or public.is_admin());
create policy amenities_write_admin on public.amenities
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- verification_requests
-- ---------------------------------------------------------------------------
create policy verification_requests_select_own on public.verification_requests
  for select to authenticated
  using (seller_id = auth.uid() or public.is_admin());

create policy verification_requests_insert_own on public.verification_requests
  for insert to authenticated
  with check (public.owns_property(property_id));

create policy verification_requests_update_admin on public.verification_requests
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ===========================================================================
-- Curated cross-user projections
-- ---------------------------------------------------------------------------
-- Two places legitimately need a phone number that belongs to someone else.
-- Rather than widening the profiles policy (which would leak every number to
-- everyone), each case gets a view that hard-codes the authorisation test in
-- its WHERE clause and exposes only the columns that case needs.
-- ===========================================================================

-- (a) Buyer → seller, but only for listings the buyer has actually unlocked.
create view public.unlocked_seller_contacts
with (security_invoker = false) as
select
  cu.id          as contact_unlock_id,
  cu.property_id,
  cu.user_id     as buyer_id,
  cu.seller_id,
  cu.is_free,
  cu.amount,
  cu.currency,
  cu.unlocked_at,
  s.full_name    as seller_name,
  s.mobile_number as seller_mobile,
  s.avatar_url   as seller_avatar,
  s.role         as seller_type
from public.contact_unlocks cu
join public.profiles s on s.id = cu.seller_id
where cu.payment_status = 'success'
  and (cu.user_id = auth.uid() or public.is_admin());

comment on view public.unlocked_seller_contacts is
  'Reveals a seller phone number to exactly one audience: the buyer who holds a settled unlock for that listing.';

revoke all on public.unlocked_seller_contacts from public, anon, authenticated;
grant select on public.unlocked_seller_contacts to authenticated;

-- (b) Seller → buyer, for the leads the seller earned (§15).
create view public.lead_details
with (security_invoker = false) as
select
  l.id,
  l.property_id,
  l.seller_id,
  l.buyer_id,
  l.contact_unlock_id,
  l.status,
  l.notes,
  l.last_status_change_at,
  l.created_at,
  l.updated_at,
  b.full_name     as buyer_name,
  b.mobile_number as buyer_mobile,
  b.avatar_url    as buyer_avatar,
  p.title         as property_title,
  p.slug          as property_slug,
  p.city          as property_city,
  p.locality      as property_locality,
  p.price         as property_price,
  p.listing_type,
  cu.is_free      as unlock_was_free,
  cu.amount       as unlock_amount,
  cu.unlocked_at
from public.leads l
join public.profiles b        on b.id = l.buyer_id
join public.properties p      on p.id = l.property_id
join public.contact_unlocks cu on cu.id = l.contact_unlock_id
where l.seller_id = auth.uid() or public.is_admin();

comment on view public.lead_details is
  'Lead inbox for the listing owner, including the buyer contact they earned. Filtered to auth.uid() inside the view.';

revoke all on public.lead_details from public, anon, authenticated;
grant select on public.lead_details to authenticated;

-- >>> 20260924091000_contact_unlock_rpc.sql

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

-- >>> 20260924091100_storage.sql

-- ===========================================================================
-- 99Estate — 012 · Storage buckets and object policies
-- ---------------------------------------------------------------------------
-- Two buckets:
--   property-images    public read (listing photos are the product), writes
--                      restricted to the listing owner
--   verification-docs  fully private; owner + admin only
--
-- Both rely on a path convention of `properties/<property_id>/<file>` so an
-- object's owner can be derived from its key without a second lookup table.
-- ===========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'property-images',
  'property-images',
  true,
  10485760, -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'verification-docs',
  'verification-docs',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- `properties/<uuid>/<file>` → <uuid>, or NULL if the key does not follow the
-- convention. Returning NULL (instead of raising) matters: a policy that
-- errors on a malformed key would surface as a 500, whereas NULL simply fails
-- the ownership test and yields a clean 403.
-- ---------------------------------------------------------------------------
create or replace function public.storage_path_property_id(p_name text)
returns uuid
language plpgsql
immutable
as $$
declare
  v_parts text[] := string_to_array(coalesce(p_name, ''), '/');
  v_id    uuid;
begin
  if array_length(v_parts, 1) < 3 or v_parts[1] <> 'properties' then
    return null;
  end if;
  begin
    v_id := v_parts[2]::uuid;
  exception when others then
    return null;
  end;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- property-images
-- ---------------------------------------------------------------------------
-- Reads are open because the bucket is public and listings are free to browse
-- (Rule 2). Writes are not: §13 "do not expose unrestricted storage write
-- access".
drop policy if exists property_images_read on storage.objects;
create policy property_images_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'property-images');

drop policy if exists property_images_insert on storage.objects;
create policy property_images_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'property-images'
    and public.owns_property(public.storage_path_property_id(name))
  );

drop policy if exists property_images_update on storage.objects;
create policy property_images_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'property-images'
    and (public.owns_property(public.storage_path_property_id(name)) or public.is_admin())
  )
  with check (
    bucket_id = 'property-images'
    and (public.owns_property(public.storage_path_property_id(name)) or public.is_admin())
  );

drop policy if exists property_images_delete on storage.objects;
create policy property_images_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'property-images'
    and (public.owns_property(public.storage_path_property_id(name)) or public.is_admin())
  );

-- ---------------------------------------------------------------------------
-- verification-docs — ownership papers. Private bucket, signed URLs only.
-- ---------------------------------------------------------------------------
drop policy if exists verification_docs_read on storage.objects;
create policy verification_docs_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'verification-docs'
    and (public.owns_property(public.storage_path_property_id(name)) or public.is_admin())
  );

drop policy if exists verification_docs_insert on storage.objects;
create policy verification_docs_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'verification-docs'
    and public.owns_property(public.storage_path_property_id(name))
  );

drop policy if exists verification_docs_delete on storage.objects;
create policy verification_docs_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'verification-docs'
    and (public.owns_property(public.storage_path_property_id(name)) or public.is_admin())
  );

-- >>> 20260924091200_moderation_and_lifecycle.sql

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

-- >>> 20260925090000_seller_declares_type.sql

-- ===========================================================================
-- 99Estate — 014 · The seller declares who they are, per listing
-- ---------------------------------------------------------------------------
-- `properties.seller_type` was derived from `profiles.role` by a trigger. That
-- is wrong in practice: the same person genuinely is an owner on their own
-- flat and a broker on a client's, and buyers filter on this ("Posted by
-- Owner") so it has to describe the listing, not the account.
--
-- After this migration the value is chosen in the posting form, constrained to
-- owner / agent / builder, and the profile role is only the default the form
-- pre-selects.
-- ===========================================================================

-- --------------------------------------------------------------------------
-- Stop forcing the value from the profile.
-- --------------------------------------------------------------------------
drop trigger if exists properties_sync_seller_type_trg on public.properties;
drop trigger if exists profiles_propagate_role_trg on public.profiles;
drop function if exists public.properties_sync_seller_type();
drop function if exists public.profiles_propagate_role();

-- `buyer` and `admin` are account roles, never listing roles. Anything already
-- carrying one becomes `owner`, which is what the default was anyway.
update public.properties set seller_type = 'owner' where seller_type not in ('owner', 'agent', 'builder');

alter table public.properties
  add constraint properties_seller_type_check
  check (seller_type in ('owner', 'agent', 'builder'));

comment on column public.properties.seller_type is
  'Declared by the seller per listing (owner/agent/builder) and filterable by buyers. Not derived from profiles.role.';

-- --------------------------------------------------------------------------
-- Allow a seller to change it, while keeping every other pin in place.
--
-- Identical to the original guard except that `seller_type` is no longer
-- reverted on UPDATE; the CHECK constraint above is what keeps the value
-- honest.
-- --------------------------------------------------------------------------
create or replace function public.properties_guard_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_trusted boolean := public.is_trusted_writer() or public.is_admin();
begin
  if tg_op = 'INSERT' then
    if not v_trusted then
      -- A seller can only ever create their own listing, as a draft or a
      -- moderation submission. Everything else is server-assigned.
      if new.seller_id is distinct from auth.uid() then
        raise exception 'seller_id must match the authenticated user' using errcode = '42501';
      end if;
      if new.status not in ('draft', 'pending') then
        raise exception 'new listings must start as draft or pending' using errcode = '42501';
      end if;
      new.verification_status := 'unverified';
      new.is_featured         := false;
      new.published_at        := null;
      new.expires_at          := null;
      new.rejection_reason    := null;
      new.cover_image_url     := null;
      new.views_count         := 0;
      new.saves_count         := 0;
      new.unlocks_count       := 0;
      new.leads_count         := 0;
    end if;

  else -- UPDATE
    if not v_trusted then
      if new.seller_id is distinct from old.seller_id then
        raise exception 'ownership cannot be transferred' using errcode = '42501';
      end if;
      if new.verification_status is distinct from old.verification_status then
        raise exception 'verification_status is admin-managed' using errcode = '42501';
      end if;
      if new.is_featured is distinct from old.is_featured then
        raise exception 'is_featured is admin-managed' using errcode = '42501';
      end if;
      if new.rejection_reason is distinct from old.rejection_reason then
        raise exception 'rejection_reason is admin-managed' using errcode = '42501';
      end if;

      -- Counters are trigger-maintained; a seller must not be able to inflate
      -- their own view count. `seller_type` is deliberately absent — it is the
      -- seller's to declare.
      new.views_count     := old.views_count;
      new.saves_count     := old.saves_count;
      new.unlocks_count   := old.unlocks_count;
      new.leads_count     := old.leads_count;
      new.cover_image_url := old.cover_image_url;
      new.created_at      := old.created_at;

      if new.status is distinct from old.status then
        -- Allowed seller-driven transitions only.
        if not (
             (old.status = 'draft'     and new.status in ('pending'))
          or (old.status = 'pending'   and new.status in ('draft'))
          or (old.status = 'published' and new.status in ('paused', 'sold', 'rented'))
          or (old.status = 'paused'    and new.status in ('published', 'sold', 'rented'))
          or (old.status in ('sold', 'rented', 'expired') and new.status in ('paused'))
          or (old.status = 'rejected'  and new.status in ('draft', 'pending'))
        ) then
          raise exception 'sellers cannot move a listing from % to %', old.status, new.status
            using errcode = '42501';
        end if;

        -- Resuming a paused listing only works if it was approved once and the
        -- 90-day window has not run out; otherwise it must be renewed.
        if new.status = 'published' then
          if old.published_at is null then
            raise exception 'listing has not been approved yet' using errcode = '42501';
          end if;
          if old.expires_at is null or old.expires_at <= now() then
            raise exception 'listing has expired — renew it before republishing' using errcode = '42501';
          end if;
        end if;

        -- Material edits to an approved listing send it back for moderation.
      elsif old.status = 'published' and (
             new.title         is distinct from old.title
          or new.description   is distinct from old.description
          or new.price         is distinct from old.price
          or new.property_type is distinct from old.property_type
          or new.listing_type  is distinct from old.listing_type
          or new.city          is distinct from old.city
          or new.locality      is distinct from old.locality
          or new.address       is distinct from old.address
      ) then
        new.status := 'pending';
      end if;
    end if;
  end if;

  -- Publication bookkeeping applies to every writer, including admins.
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    new.published_at := coalesce(new.published_at, now());
    if new.expires_at is null or new.expires_at <= now() then
      new.expires_at := now() + make_interval(days => public.listing_duration_days());
    end if;
    new.rejection_reason := null;
  end if;

  return new;
end;
$$;


-- >>> 20260926090000_admin_posts_on_behalf.sql

-- ===========================================================================
-- 99Estate — 015 · Admins post on behalf of an owner, agent or builder
-- ---------------------------------------------------------------------------
-- Onboarding over the counter: a walk-in owner or broker dictates their
-- details and an admin lists the property for them.
--
-- The listing still belongs to that person, not to the platform. `seller_id`
-- points at their profile, the ₹9 unlock discloses their number, and the lead
-- is theirs. Nothing about the pricing model moves.
--
-- Three things were in the way:
--
--   1. `properties_insert_own` requires `seller_id = auth.uid()`, so an admin
--      could not create a listing for anybody else. The write *trigger* has
--      always waved admins through — the RLS policy had not.
--   2. `property_images_insert` requires `owns_property()`, so an admin could
--      not add the three photos a listing needs before submission. Update and
--      delete on the same bucket already allowed admins; insert was the gap.
--   3. Nothing recorded who posted a listing on whose behalf. For a feature
--      that publishes a third party's phone number under their name, that is
--      the one question that has to stay answerable afterwards.
--
-- Written to be re-runnable, because it is applied by pasting into the
-- Supabase SQL Editor rather than through the CLI.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1 · Provenance
-- ---------------------------------------------------------------------------
alter table public.properties
  add column if not exists posted_by uuid references public.profiles (id) on delete set null;

comment on column public.properties.posted_by is
  'The admin who created this listing on the seller''s behalf. NULL on a self-posted listing.';

-- Partial: the overwhelming majority of listings are self-posted, and the only
-- query that wants this column is "what have I posted for other people".
create index if not exists properties_posted_by_idx
  on public.properties (posted_by, created_at desc)
  where posted_by is not null;

-- ---------------------------------------------------------------------------
-- 2 · Sellers who cannot sign in
-- ---------------------------------------------------------------------------
-- An owner who gives a mobile number but no email still needs a profile row,
-- because properties.seller_id and leads.seller_id both require one.
--
-- They get an address in the RFC 2606 `.invalid` TLD, which is reserved
-- precisely so that it can never resolve or receive mail, and this flag — so
-- every surface can tell a person who has not signed in yet apart from one who
-- has no way to.
alter table public.profiles
  add column if not exists is_placeholder boolean not null default false;

comment on column public.profiles.is_placeholder is
  'TRUE when an admin created this record from dictated details and the person gave no usable email, so they cannot sign in and claim it. Their enquiries have to be relayed by the admin who posted the listing.';

create index if not exists profiles_placeholder_idx
  on public.profiles (id) where is_placeholder;

-- ---------------------------------------------------------------------------
-- 3 · Let an admin insert a listing for someone else
-- ---------------------------------------------------------------------------
-- Note which profile has to be complete in each branch. Self-serve checks the
-- caller, as before. The admin branch checks the *seller* — a stricter rule
-- than the original, and deliberately so: it makes an admin-posted listing
-- whose owner has no reachable number impossible to create, rather than
-- selling a buyer a ₹9 unlock that discloses nothing.
drop policy if exists properties_insert_own on public.properties;
create policy properties_insert_own on public.properties
  for insert to authenticated
  with check (
    (seller_id = auth.uid() and public.profile_is_complete())
    or (public.is_admin() and public.profile_is_complete(seller_id))
  );

-- ---------------------------------------------------------------------------
-- 4 · Let an admin add the photos
-- ---------------------------------------------------------------------------
-- Brings insert into line with update and delete, which have allowed admins
-- since the bucket was created. Still no unrestricted write access: the path
-- must resolve to a real listing.
drop policy if exists property_images_insert on storage.objects;
create policy property_images_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'property-images'
    and (public.owns_property(public.storage_path_property_id(name)) or public.is_admin())
  );

-- ---------------------------------------------------------------------------
-- 5 · Pin both new columns against the people they describe
-- ---------------------------------------------------------------------------
-- Separate triggers rather than another rewrite of properties_guard_write.
-- That function is 150 lines of safety-critical branching and has already been
-- replaced once by the seller_type migration; re-transcribing it to add two
-- assignments is a good way to lose a rule in the copy. BEFORE triggers fire in
-- name order and these touch only columns the main guard never sets, so the two
-- cannot disagree.
create or replace function public.properties_guard_posted_by()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_trusted_writer() or public.is_admin() then
    return new;
  end if;

  -- A seller must not be able to dress their own listing up as one the
  -- platform placed on their behalf, which would borrow credibility the
  -- listing has not earned.
  if tg_op = 'INSERT' then
    new.posted_by := null;
  else
    new.posted_by := old.posted_by;
  end if;

  return new;
end;
$$;

drop trigger if exists properties_guard_posted_by_trg on public.properties;
create trigger properties_guard_posted_by_trg
  before insert or update on public.properties
  for each row execute function public.properties_guard_posted_by();

create or replace function public.profiles_guard_placeholder()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_trusted_writer() or public.is_admin() then
    return new;
  end if;

  -- Nobody talks their own account into, or out of, being a placeholder.
  new.is_placeholder := old.is_placeholder;
  return new;
end;
$$;

drop trigger if exists profiles_guard_placeholder_trg on public.profiles;
create trigger profiles_guard_placeholder_trg
  before update on public.profiles
  for each row execute function public.profiles_guard_placeholder();
