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
