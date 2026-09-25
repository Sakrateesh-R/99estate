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
