-- ===========================================================================
-- 99Estate — PENDING MIGRATION HANDOVER
--
-- Paste this whole file into the Supabase SQL Editor for project
-- `xmmwshyxvjviulnyguvu` and run it once.
--
-- It is migrations 029 and 030, concatenated in that order:
--
--   029  supabase/migrations/20261007090000_organizations_and_projects.sql
--        Organizations, projects, media, amenities, buildings, floors and
--        inventory, plus the two nullable foreign keys that let an individual
--        listing belong to a project.
--
--   030  supabase/migrations/20261007090100_leads_cover_projects.sql
--        Makes the existing `leads` table able to hold a project enquiry, and
--        adds submit_project_enquiry().
--
-- The order matters: 030 references `public.project_units`, which 029 creates.
-- Running them the other way round fails loudly on the missing table rather
-- than doing anything silently wrong.
--
-- Both halves are written to be re-runnable (`if not exists`, `drop policy if
-- exists`, `create or replace`), so if the editor times out part-way through,
-- running the file again from the top is safe.
--
-- Verified unapplied against the hosted project on 2026-10-16: `organizations`,
-- `projects`, `project_units`, `project_media` and `builder_public_profiles`
-- all return PGRST205 (relation does not exist), and
-- `properties.project_id` returns 42703.
-- ===========================================================================


-- ===========================================================================
-- 99Estate — 029 · Organizations, projects and project inventory
-- ---------------------------------------------------------------------------
-- The schema half of the builder/promoter architecture. Nothing here changes
-- how an individual listing works: `properties` gains two nullable foreign
-- keys and keeps every existing column, constraint, trigger and policy.
--
-- The shape being added, alongside the listing table rather than on top of it:
--
--   organizations ──< organization_members
--        │
--        └──< projects ──< project_media
--                   ├──< project_amenities
--                   ├──< project_buildings ──< project_floors
--                   └──< project_units  (building_id / floor_id both NULL-able)
--
--   properties.project_id       nullable — an individual listing never needs one
--   properties.organization_id  nullable — an owner posting their own flat has none
--
-- Three decisions worth stating, because each is the kind that is expensive to
-- reverse:
--
--   1 · One inventory table, not two. A flat in Tower A and a plot in a layout
--       are the same row shape with different columns filled in, so
--       `project_units.building_id` and `.floor_id` are nullable rather than
--       there being a parallel `project_plots`. That is what lets a plot
--       project skip the building/floor structure entirely without a second
--       model to keep in step. The grid coordinates a visual plot map will
--       need are columns on the same row, so that feature is UI work later and
--       not another migration.
--
--   2 · Amenities are stored as `amenity_name` text against the existing
--       `amenities` vocabulary, exactly as `property_amenities` does, instead
--       of a UUID join to it. Matching the established pattern matters more
--       here than the referential purity: two amenity models in one schema is
--       how the two drift.
--
--   3 · `entity_verification_status` is a NEW enum rather than `suspended`
--       being appended to `public.verification_status`. Two reasons. Adding a
--       value to the shared enum would silently make `suspended` a legal
--       verification state for every existing property, which nothing in the
--       listing code is written to handle. And `ALTER TYPE ... ADD VALUE`
--       cannot have its new value *used* later in the same transaction, which
--       the RLS policies below do — so a single pasted script would fail
--       halfway. Properties keep their enum untouched.
--
-- Written to be re-runnable (`if not exists`, `drop policy if exists`,
-- `create or replace`), because it is applied by pasting into the Supabase SQL
-- Editor rather than through the CLI.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1 · Enums
-- ---------------------------------------------------------------------------
-- `do $$ ... exception when duplicate_object` rather than a catalogue lookup:
-- it is the shortest form that is genuinely re-runnable, and a half-applied
-- paste has to be safe to run again.

do $$ begin
  create type public.organization_type as enum (
    'owner', 'agent', 'broker', 'builder', 'promoter', 'developer', 'real_estate_company'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.org_member_role as enum (
    'owner', 'admin', 'sales_manager', 'sales_executive', 'marketing', 'viewer'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.org_member_status as enum ('invited', 'active', 'suspended');
exception when duplicate_object then null; end $$;

-- §22 applied to organizations and projects. Deliberately NOT the same type as
-- `public.verification_status` — see note 3 in the header.
do $$ begin
  create type public.entity_verification_status as enum (
    'unverified', 'pending', 'verified', 'rejected', 'suspended'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.project_type as enum (
    'apartment', 'villa', 'independent_house', 'plot', 'commercial', 'mixed_development'
  );
exception when duplicate_object then null; end $$;

-- §7 — the project's own lifecycle. Separate from unit status by design: a
-- project can be UNDER_CONSTRUCTION while one unit is AVAILABLE and the next
-- is SOLD.
do $$ begin
  create type public.project_status as enum (
    'upcoming', 'pre_launch', 'new_launch', 'under_construction',
    'near_completion', 'ready_to_move', 'completed', 'sold_out'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.unit_status as enum ('available', 'hold', 'booked', 'sold', 'blocked');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.project_media_type as enum (
    'cover', 'gallery', 'floor_plan', 'master_plan', 'brochure', 'video',
    'construction_update', 'other'
  );
exception when duplicate_object then null; end $$;

-- §8 — "Do not show Verified unless admin actually verifies it", as a type.
do $$ begin
  create type public.progress_verification_status as enum ('promoter_reported', 'admin_verified');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.building_status as enum (
    'planned', 'under_construction', 'completed', 'sold_out'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 2 · Settings
-- ---------------------------------------------------------------------------
insert into public.app_settings (key, value, description, is_public) values
  ('max_organizations_per_user', '3'::jsonb,
   'How many organizations one account may create. Anti-spam, not a product limit.', false),
  ('max_media_per_project', '40'::jsonb,
   'Upload cap per project across gallery, floor plans, master plan and construction updates.', true)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 3 · Organizations (§2)
-- ---------------------------------------------------------------------------
create table if not exists public.organizations (
  id                  uuid primary key default gen_random_uuid(),
  -- The account that created the record. The OWNER membership is created from
  -- it by a trigger; this column is provenance and survives a transfer.
  created_by          uuid references public.profiles (id) on delete set null,

  name                text not null,
  slug                text not null unique,

  -- §2 "Allow multiple organization types": ABC Infra is genuinely a builder,
  -- a developer and a promoter. An array rather than a single column, so the
  -- public profile can say all three instead of picking one.
  org_types           public.organization_type[] not null default '{builder}',

  logo_url            text,
  cover_image_url     text,
  about               text,
  established_year    smallint,

  phone               text,
  email               text,
  website             text,
  office_address      text,
  locality            text,
  city                text,
  state               text,
  country             text not null default 'India',
  pincode             text,

  -- §2 "Do not expose sensitive verification documents publicly." These two
  -- are registration identifiers, not documents, and are shown on the public
  -- profile the way a builder prints them on a brochure. The papers behind
  -- them are Phase 2 and land in a private table.
  gst_number          text,
  rera_number         text,

  verification_status public.entity_verification_status not null default 'unverified',
  -- Generated, therefore un-spoofable: there is no column a member can write
  -- to award themselves a badge. Mirrors profiles.is_profile_complete.
  is_verified         boolean generated always as (verification_status = 'verified') stored,
  verified_at         timestamptz,
  admin_notes         text,

  projects_count      integer not null default 0,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint organizations_name_length_check check (char_length(trim(name)) between 2 and 150),
  constraint organizations_slug_shape_check  check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint organizations_types_not_empty_check check (array_length(org_types, 1) >= 1),
  constraint organizations_about_length_check check (about is null or char_length(about) <= 8000),
  constraint organizations_established_year_check
    check (established_year is null or established_year between 1800 and extract(year from now())::int),
  constraint organizations_phone_check
    check (phone is null or phone ~ '^[6-9][0-9]{9}$'),
  constraint organizations_email_check
    check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint organizations_website_check
    check (website is null or (length(website) <= 300 and website ~* '^https?://')),
  constraint organizations_pincode_check check (pincode is null or pincode ~ '^[1-9][0-9]{5}$')
);

comment on table public.organizations is
  'Builder / promoter / developer / agency record. Public profile lives at /builders/<slug>.';
comment on column public.organizations.org_types is
  'One company can be several things at once (BUILDER + DEVELOPER + PROMOTER); the public profile lists all of them.';
comment on column public.organizations.is_verified is
  'Generated from verification_status. There is no writable "verified" flag — §22 requires an admin decision.';

create index if not exists organizations_city_idx on public.organizations (lower(city));
create index if not exists organizations_verification_idx on public.organizations (verification_status);
create index if not exists organizations_created_by_idx on public.organizations (created_by, created_at desc);
create index if not exists organizations_types_idx on public.organizations using gin (org_types);
create index if not exists organizations_name_trgm_idx
  on public.organizations using gin (name extensions.gin_trgm_ops);

drop trigger if exists organizations_set_updated_at on public.organizations;
create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Slugs.
--
-- Assigned once, on insert, and left alone afterwards: a builder who renames
-- themselves must not silently move their public URL and strand every link and
-- every ranking it has earned (§37 "Do not create duplicate SEO URLs"). An
-- admin can still set one explicitly.
--
-- The loop is what makes two "ABC Builders" possible. `slugify` is the same
-- helper the listing slugs use, so the two URL families cannot disagree about
-- what a slug looks like.
-- ---------------------------------------------------------------------------
create or replace function public.organizations_set_slug()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base      text;
  v_candidate text;
  v_n         integer := 1;
begin
  if tg_op = 'UPDATE' then
    -- Only fill a slug in; never rewrite one that already resolves.
    if nullif(trim(coalesce(new.slug, '')), '') is not null then
      return new;
    end if;
  end if;

  v_base := coalesce(public.slugify(new.slug), public.slugify(new.name), 'builder');
  v_candidate := v_base;

  while exists (select 1 from public.organizations o where o.slug = v_candidate and o.id <> new.id) loop
    v_n := v_n + 1;
    v_candidate := v_base || '-' || v_n;
  end loop;

  new.slug := v_candidate;
  return new;
end;
$$;

drop trigger if exists organizations_set_slug_trg on public.organizations;
create trigger organizations_set_slug_trg
  before insert or update of slug, name on public.organizations
  for each row execute function public.organizations_set_slug();

-- ---------------------------------------------------------------------------
-- 4 · Organization members (§3)
-- ---------------------------------------------------------------------------
create table if not exists public.organization_members (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  role            public.org_member_role not null default 'viewer',
  status          public.org_member_status not null default 'active',
  invited_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint organization_members_unique unique (organization_id, user_id)
);

comment on table public.organization_members is
  'Who may act for an organization, and in what capacity. Every org-scoped RLS policy resolves through this table.';

create index if not exists organization_members_org_idx on public.organization_members (organization_id, role);
create index if not exists organization_members_user_idx on public.organization_members (user_id, status);

drop trigger if exists organization_members_set_updated_at on public.organization_members;
create trigger organization_members_set_updated_at
  before update on public.organization_members
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5 · Role resolution
-- ---------------------------------------------------------------------------
-- Every one of these is SECURITY DEFINER for the same reason the profile
-- helpers are: they are called from inside RLS policies on the very tables
-- they read, and a SECURITY INVOKER version would recurse through the policy
-- it is being evaluated for.
--
-- The function is `org_role_of`, not `org_member_role` — that name is taken by
-- the enum above, and having a function and a type share a name is legal,
-- confusing, and a source of ambiguous casts.
-- ---------------------------------------------------------------------------
create or replace function public.org_role_of(p_org_id uuid, p_uid uuid default auth.uid())
returns public.org_member_role
language sql
stable
security definer
set search_path = public
as $$
  select m.role
  from public.organization_members m
  where m.organization_id = p_org_id
    and m.user_id = p_uid
    and m.status = 'active';
$$;

create or replace function public.is_org_member(p_org_id uuid, p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_org_id is not null and p_uid is not null
     and public.org_role_of(p_org_id, p_uid) is not null;
$$;

-- OWNER + ADMIN: the team, the company profile, creating and deleting projects.
create or replace function public.can_manage_org(p_org_id uuid, p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.org_role_of(p_org_id, p_uid) in ('owner', 'admin');
$$;

-- + SALES_MANAGER: inventory and leads (§3).
create or replace function public.can_manage_org_inventory(p_org_id uuid, p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.org_role_of(p_org_id, p_uid) in ('owner', 'admin', 'sales_manager');
$$;

-- + MARKETING: project and property marketing information (§3), which is the
-- project record itself, its media and its amenities — but not its inventory
-- and not the team.
create or replace function public.can_manage_org_marketing(p_org_id uuid, p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.org_role_of(p_org_id, p_uid) in ('owner', 'admin', 'sales_manager', 'marketing');
$$;

-- ---------------------------------------------------------------------------
-- The creator becomes the OWNER.
--
-- Without this an organization is born unmanageable: every write policy below
-- resolves through `organization_members`, and the row that would grant the
-- first membership cannot itself be inserted by a non-member. SECURITY DEFINER
-- so it is not subject to that policy.
-- ---------------------------------------------------------------------------
create or replace function public.organizations_seed_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := coalesce(new.created_by, auth.uid());
begin
  if v_uid is null then
    return null;
  end if;

  insert into public.organization_members (organization_id, user_id, role, status)
  values (new.id, v_uid, 'owner', 'active')
  on conflict (organization_id, user_id) do update set role = 'owner', status = 'active';

  return null;
end;
$$;

drop trigger if exists organizations_seed_owner_trg on public.organizations;
create trigger organizations_seed_owner_trg
  after insert on public.organizations
  for each row execute function public.organizations_seed_owner();

-- ---------------------------------------------------------------------------
-- An organization always has at least one active OWNER.
--
-- Demoting or removing the last one leaves the record in the same
-- unmanageable state the seed trigger exists to prevent — except that this
-- time there is no insert to hang a fix on, and only a platform admin could
-- recover it.
-- ---------------------------------------------------------------------------
create or replace function public.organization_members_keep_an_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org   uuid := coalesce(old.organization_id, new.organization_id);
  v_owners integer;
begin
  -- Nothing to protect once the organization itself is going away.
  if not exists (select 1 from public.organizations where id = v_org) then
    return null;
  end if;

  select count(*) into v_owners
  from public.organization_members
  where organization_id = v_org and role = 'owner' and status = 'active';

  if v_owners = 0 then
    raise exception 'an organization must keep at least one active owner'
      using errcode = '23514';
  end if;

  return null;
end;
$$;

drop trigger if exists organization_members_keep_an_owner_trg on public.organization_members;
create constraint trigger organization_members_keep_an_owner_trg
  after update or delete on public.organization_members
  deferrable initially deferred
  for each row execute function public.organization_members_keep_an_owner();

-- ---------------------------------------------------------------------------
-- Membership write guard.
--
-- RLS decides who may touch the table; this decides what they may say. Three
-- things it stops that a row policy cannot: promoting yourself, editing your
-- own membership at all, and creating memberships for an organization you do
-- not manage.
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER on purpose — see is_trusted_writer().
create or replace function public.organization_members_guard_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_trusted_writer() or public.is_admin() then
    return new;
  end if;

  if tg_op = 'DELETE' then
    -- Leaving is allowed; removing somebody else needs the manage right.
    if old.user_id <> auth.uid() and not public.can_manage_org(old.organization_id) then
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

drop trigger if exists organization_members_guard_write_trg on public.organization_members;
create trigger organization_members_guard_write_trg
  before insert or update or delete on public.organization_members
  for each row execute function public.organization_members_guard_write();

-- ---------------------------------------------------------------------------
-- Organization write guard — pins everything §22 reserves for an admin.
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER on purpose — see is_trusted_writer().
create or replace function public.organizations_guard_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_limit integer;
  v_count integer;
begin
  if public.is_trusted_writer() or public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.created_by          := auth.uid();
    new.verification_status := 'unverified';
    new.verified_at         := null;
    new.admin_notes         := null;
    new.projects_count      := 0;

    v_limit := public.setting_int('max_organizations_per_user', 3);
    select count(*) into v_count from public.organizations where created_by = auth.uid();
    if v_count >= v_limit then
      raise exception 'you can create at most % organizations', v_limit using errcode = '23514';
    end if;

    return new;
  end if;

  -- UPDATE
  if new.verification_status is distinct from old.verification_status then
    raise exception 'verification_status is admin-managed' using errcode = '42501';
  end if;
  new.created_by     := old.created_by;
  new.verified_at    := old.verified_at;
  new.admin_notes    := old.admin_notes;
  new.projects_count := old.projects_count;
  new.created_at     := old.created_at;

  return new;
end;
$$;

drop trigger if exists organizations_guard_write_trg on public.organizations;
create trigger organizations_guard_write_trg
  before insert or update on public.organizations
  for each row execute function public.organizations_guard_write();

-- ---------------------------------------------------------------------------
-- 6 · Projects (§5)
-- ---------------------------------------------------------------------------
create table if not exists public.projects (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  created_by          uuid references public.profiles (id) on delete set null,

  name                text not null,
  slug                text not null unique,
  -- The builder's own reference ("ABCH-P2"), not ours. Unique inside the
  -- organization so two builders may both use "PHASE-1".
  project_code        text,
  description         text,

  project_type        public.project_type not null,
  -- The unit-level taxonomy, reusing the listing enum so a project and a
  -- listing describe an apartment with the same word. Empty = mixed.
  property_types      public.property_type[] not null default '{}',
  status              public.project_status not null default 'upcoming',

  -- ---- Location --------------------------------------------------------
  address             text,
  locality            text,
  city                text not null,
  district            text,
  state               text,
  pincode             text,
  latitude            numeric(9, 6),
  longitude           numeric(9, 6),
  map_url             text,

  -- ---- Scale -----------------------------------------------------------
  total_area          numeric(12, 2),
  total_area_unit     public.area_unit not null default 'acre',
  total_area_sqft     numeric(16, 2) generated always as (public.to_sqft(total_area, total_area_unit)) stored,

  -- Declared from the brochure, and the reason it is not the same thing as
  -- `units_total` below: a builder announces 120 apartments long before 120
  -- rows exist, and the project page has to be able to say so.
  total_units         integer,

  -- Trigger-maintained from `project_units`. §5 wants availableUnits /
  -- bookedUnits / soldUnits; counting them live would be five correlated
  -- subqueries on every card in a grid.
  units_total         integer not null default 0,
  units_available     integer not null default 0,
  units_hold          integer not null default 0,
  units_booked        integer not null default 0,
  units_sold          integer not null default 0,
  units_blocked       integer not null default 0,

  -- ---- Commercials -----------------------------------------------------
  -- Declared by the builder, which is what the card shows ("₹55L – ₹82L").
  -- Kept separate from the inventory's own min/max on purpose: overwriting a
  -- builder's stated range from whichever units happen to be loaded would
  -- silently contradict their brochure.
  price_min           numeric(14, 2),
  price_max           numeric(14, 2),
  -- §26 "2 & 3 BHK Apartments".
  bedroom_options     smallint[] not null default '{}',

  -- ---- Dates -----------------------------------------------------------
  launch_date              date,
  expected_completion_date date,
  actual_completion_date   date,

  -- ---- Construction progress (§8) --------------------------------------
  construction_progress_percentage smallint,
  construction_progress_note       text,
  last_progress_update             timestamptz,
  progress_updated_by              uuid references public.profiles (id) on delete set null,
  -- Defaults to the honest answer. Only an admin RPC can move it to
  -- 'admin_verified', which is what §8 means by "Do not show Verified unless
  -- admin actually verifies it".
  progress_verification            public.progress_verification_status
                                     not null default 'promoter_reported',

  -- ---- Trust -----------------------------------------------------------
  rera_number         text,
  verification_status public.entity_verification_status not null default 'unverified',
  is_verified         boolean generated always as (verification_status = 'verified') stored,
  verified_at         timestamptz,
  admin_notes         text,
  is_featured         boolean not null default false,

  -- ---- Publication -----------------------------------------------------
  -- Distinct from `status`: that is where the building has got to, this is
  -- whether the page is live. A COMPLETED project stays published (§18) — it
  -- is the builder's track record and must not vanish when the last unit sells.
  is_published        boolean not null default false,
  published_at        timestamptz,

  cover_image_url     text,
  views_count         integer not null default 0,
  leads_count         integer not null default 0,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  search_vector       tsvector generated always as (
    setweight(to_tsvector('simple', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(locality, '') || ' ' || coalesce(city, '') || ' ' || coalesce(district, '') || ' ' || coalesce(state, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'D')
  ) stored,

  constraint projects_name_length_check check (char_length(trim(name)) between 3 and 150),
  constraint projects_slug_shape_check  check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint projects_code_check        check (project_code is null or char_length(trim(project_code)) between 2 and 40),
  constraint projects_description_length_check check (description is null or char_length(description) <= 12000),
  constraint projects_city_check        check (char_length(trim(city)) >= 2),
  constraint projects_pincode_check     check (pincode is null or pincode ~ '^[1-9][0-9]{5}$'),
  constraint projects_latitude_check    check (latitude is null or latitude between -90 and 90),
  constraint projects_longitude_check   check (longitude is null or longitude between -180 and 180),
  constraint projects_total_area_check  check (total_area is null or (total_area > 0 and total_area < 1e9)),
  constraint projects_total_units_check check (total_units is null or total_units between 0 and 100000),
  constraint projects_price_min_check   check (price_min is null or (price_min > 0 and price_min < 1e13)),
  constraint projects_price_max_check   check (price_max is null or (price_max > 0 and price_max < 1e13)),
  constraint projects_price_range_check check (price_min is null or price_max is null or price_max >= price_min),
  constraint projects_progress_check
    check (construction_progress_percentage is null or construction_progress_percentage between 0 and 100),
  constraint projects_progress_note_check
    check (construction_progress_note is null or char_length(construction_progress_note) <= 1000),
  -- Same division of labour as properties.map_url: the CHECK pins scheme, host
  -- and length, and lib/properties/map-link.ts decides whether the link is
  -- actually usable.
  constraint projects_map_url_check check (
    map_url is null
    or (
      length(map_url) <= 2048
      and map_url ~ '^https://(maps\.app\.goo\.gl|(www\.)?goo\.gl|(www\.|maps\.)?google\.(com|co\.in))(/|$)'
    )
  ),
  -- A published project must have been published at some point, so the public
  -- query can order by it without a coalesce on every row.
  constraint projects_published_needs_timestamp_check
    check (not is_published or published_at is not null)
);

comment on table public.projects is
  'A builder/promoter development. Contains inventory; a project stays publicly visible when complete and sold out (§18).';
comment on column public.projects.status is
  'Where construction has got to. Independent of unit status and of is_published.';
comment on column public.projects.total_units is
  'Declared from the brochure. units_total is the number of inventory rows actually loaded — the two legitimately differ.';
comment on column public.projects.progress_verification is
  'promoter_reported until an admin says otherwise. The UI must not print "Verified" for the former.';

create unique index if not exists projects_org_code_idx
  on public.projects (organization_id, lower(project_code))
  where project_code is not null;

create index if not exists projects_org_idx on public.projects (organization_id, created_at desc);
create index if not exists projects_slug_idx on public.projects (slug);

-- The public searches only published projects, so the hot indexes are partial
-- on that — same reasoning as the properties_live_* set.
create index if not exists projects_live_recent_idx
  on public.projects (published_at desc nulls last) where is_published;
create index if not exists projects_live_city_idx
  on public.projects (lower(city), project_type, status) where is_published;
create index if not exists projects_live_status_idx
  on public.projects (status, published_at desc) where is_published;
create index if not exists projects_live_price_idx
  on public.projects (price_min, price_max) where is_published;
create index if not exists projects_live_featured_idx
  on public.projects (is_featured, published_at desc) where is_published;
create index if not exists projects_live_verified_idx
  on public.projects (verification_status) where is_published;
create index if not exists projects_live_types_idx
  on public.projects using gin (property_types) where is_published;
create index if not exists projects_live_bedrooms_idx
  on public.projects using gin (bedroom_options) where is_published;

create index if not exists projects_search_vector_idx on public.projects using gin (search_vector);
create index if not exists projects_city_trgm_idx
  on public.projects using gin (city extensions.gin_trgm_ops);
create index if not exists projects_locality_trgm_idx
  on public.projects using gin (locality extensions.gin_trgm_ops);

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Project slugs. Same rules as the organization's, and for the same reason:
-- assigned once, stable across a rename, deduplicated with a counter. The city
-- is folded in because "Green Valley" is a name four builders in four states
-- will all use.
-- ---------------------------------------------------------------------------
create or replace function public.projects_set_slug()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base      text;
  v_candidate text;
  v_n         integer := 1;
begin
  if tg_op = 'UPDATE' and nullif(trim(coalesce(new.slug, '')), '') is not null then
    return new;
  end if;

  v_base := coalesce(
    public.slugify(new.slug),
    public.slugify(concat_ws(' ', new.name, new.locality, new.city)),
    'project'
  );
  v_candidate := v_base;

  while exists (select 1 from public.projects p where p.slug = v_candidate and p.id <> new.id) loop
    v_n := v_n + 1;
    v_candidate := v_base || '-' || v_n;
  end loop;

  new.slug := v_candidate;
  return new;
end;
$$;

drop trigger if exists projects_set_slug_trg on public.projects;
create trigger projects_set_slug_trg
  before insert or update of slug, name, locality, city on public.projects
  for each row execute function public.projects_set_slug();

-- ---------------------------------------------------------------------------
-- Project visibility helpers, used by RLS on every child table and by the
-- enquiry RPC. SECURITY DEFINER to avoid recursive policy evaluation — the
-- same pattern as can_view_property().
-- ---------------------------------------------------------------------------
create or replace function public.project_is_live(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects p
    join public.organizations o on o.id = p.organization_id
    where p.id = p_project_id
      and p.is_published
      -- A suspended project, or one belonging to a suspended company, is off
      -- the market. Note there is deliberately no availability or expiry
      -- condition: §18 keeps completed, sold-out projects public.
      and p.verification_status <> 'suspended'
      and o.verification_status <> 'suspended'
  );
$$;

create or replace function public.project_org_id(p_project_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from public.projects where id = p_project_id;
$$;

create or replace function public.can_view_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.project_is_live(p_project_id)
      or public.is_org_member(public.project_org_id(p_project_id))
      or public.is_admin()
      or public.is_service_role();
$$;

create or replace function public.can_manage_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_manage_org_marketing(public.project_org_id(p_project_id)) or public.is_admin();
$$;

create or replace function public.can_manage_project_inventory(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_manage_org_inventory(public.project_org_id(p_project_id)) or public.is_admin();
$$;

-- ---------------------------------------------------------------------------
-- Project write guard — the §22 pins, and the publication bookkeeping.
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER on purpose — see is_trusted_writer().
create or replace function public.projects_guard_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_trusted boolean := public.is_trusted_writer() or public.is_admin();
begin
  if tg_op = 'INSERT' then
    if not v_trusted then
      if not public.can_manage_org(new.organization_id) then
        raise exception 'only an owner or admin of the organization can create a project'
          using errcode = '42501';
      end if;
      new.created_by                    := auth.uid();
      new.verification_status           := 'unverified';
      new.verified_at                   := null;
      new.admin_notes                   := null;
      new.is_featured                   := false;
      new.progress_verification         := 'promoter_reported';
      new.units_total                   := 0;
      new.units_available               := 0;
      new.units_hold                    := 0;
      new.units_booked                  := 0;
      new.units_sold                    := 0;
      new.units_blocked                 := 0;
      new.views_count                   := 0;
      new.leads_count                   := 0;
      new.cover_image_url               := null;
    end if;

  else -- UPDATE
    if not v_trusted then
      if new.organization_id is distinct from old.organization_id then
        raise exception 'a project cannot be moved to another organization' using errcode = '42501';
      end if;
      if new.verification_status is distinct from old.verification_status then
        raise exception 'verification_status is admin-managed' using errcode = '42501';
      end if;
      if new.is_featured is distinct from old.is_featured then
        raise exception 'is_featured is admin-managed' using errcode = '42501';
      end if;
      -- §8: a promoter reports progress, an admin verifies it. Letting the
      -- promoter write this column would make the badge self-awarded, which is
      -- the exact thing §22 forbids.
      if new.progress_verification is distinct from old.progress_verification then
        raise exception 'progress verification is admin-managed' using errcode = '42501';
      end if;

      new.created_by      := old.created_by;
      new.verified_at     := old.verified_at;
      new.admin_notes     := old.admin_notes;
      new.units_total     := old.units_total;
      new.units_available := old.units_available;
      new.units_hold      := old.units_hold;
      new.units_booked    := old.units_booked;
      new.units_sold      := old.units_sold;
      new.units_blocked   := old.units_blocked;
      new.views_count     := old.views_count;
      new.leads_count     := old.leads_count;
      new.cover_image_url := old.cover_image_url;
      new.created_at      := old.created_at;
    end if;
  end if;

  -- Progress bookkeeping, for every writer: a percentage that changes is a
  -- fresh report, and §8 shows "Last updated" next to it.
  if tg_op = 'UPDATE'
     and new.construction_progress_percentage is distinct from old.construction_progress_percentage then
    new.last_progress_update := now();
    new.progress_updated_by  := coalesce(auth.uid(), new.progress_updated_by);
  end if;

  -- Publication bookkeeping, for every writer including admins.
  if new.is_published and (tg_op = 'INSERT' or not old.is_published) then
    new.published_at := coalesce(new.published_at, now());
  end if;

  return new;
end;
$$;

drop trigger if exists projects_guard_write_trg on public.projects;
create trigger projects_guard_write_trg
  before insert or update on public.projects
  for each row execute function public.projects_guard_write();

-- Keep organizations.projects_count honest.
create or replace function public.projects_sync_org_counter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.organizations set projects_count = projects_count + 1
     where id = new.organization_id;
  elsif tg_op = 'DELETE' then
    update public.organizations set projects_count = greatest(0, projects_count - 1)
     where id = old.organization_id;
  end if;
  return null;
end;
$$;

drop trigger if exists projects_sync_org_counter_trg on public.projects;
create trigger projects_sync_org_counter_trg
  after insert or delete on public.projects
  for each row execute function public.projects_sync_org_counter();

-- ---------------------------------------------------------------------------
-- 7 · Project media (§9)
-- ---------------------------------------------------------------------------
create table if not exists public.project_media (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  type         public.project_media_type not null default 'gallery',

  -- Object key inside the `project-media` bucket, for anything we host.
  -- NULL for a video, which is linked and never hosted — the same decision
  -- properties.video_url records, and for the same reason: egress is the cost
  -- that bites on video.
  storage_path text unique,
  url          text not null,

  title        text,
  sort_order   smallint not null default 0,
  is_primary   boolean not null default false,
  width        integer,
  height       integer,
  byte_size    integer,
  created_at   timestamptz not null default now(),

  constraint project_media_url_check check (length(url) between 8 and 2048 and url ~* '^https?://'),
  constraint project_media_storage_path_check
    check (storage_path is null or storage_path ~ ('^projects/[0-9a-fA-F-]{36}/')),
  constraint project_media_title_check check (title is null or char_length(title) <= 150),
  constraint project_media_sort_order_check check (sort_order between 0 and 200),
  constraint project_media_byte_size_check check (byte_size is null or byte_size <= 10 * 1024 * 1024)
);

comment on table public.project_media is
  'Gallery, floor plans, master plan, brochure, construction updates and video links for a project.';

create index if not exists project_media_project_idx
  on public.project_media (project_id, type, sort_order, created_at);

-- At most one cover per project, enforced here rather than in the UI so
-- "set as cover" stays a two-statement update.
create unique index if not exists project_media_single_cover_idx
  on public.project_media (project_id)
  where type = 'cover';

-- Cap the upload count (§9 has no number of its own, so this mirrors §13's).
create or replace function public.project_media_enforce_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := public.setting_int('max_media_per_project', 40);
  v_count integer;
begin
  select count(*) into v_count from public.project_media where project_id = new.project_id;
  if v_count >= v_limit then
    raise exception 'a project can have at most % media items', v_limit using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists project_media_enforce_limit_trg on public.project_media;
create trigger project_media_enforce_limit_trg
  before insert on public.project_media
  for each row execute function public.project_media_enforce_limit();

-- Mirror the cover onto projects.cover_image_url so a grid of project cards is
-- one single-table read. Prefers the designated cover, then the first gallery
-- image — a project whose builder never pressed "set as cover" still has one.
create or replace function public.project_media_sync_cover_url()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid := coalesce(new.project_id, old.project_id);
begin
  update public.projects p
     set cover_image_url = (
       select m.url
       from public.project_media m
       where m.project_id = v_project_id
         and m.type in ('cover', 'gallery')
       order by (m.type = 'cover') desc, m.sort_order, m.created_at
       limit 1
     )
   where p.id = v_project_id;

  return null;
end;
$$;

drop trigger if exists z_project_media_sync_cover_url_trg on public.project_media;
create trigger z_project_media_sync_cover_url_trg
  after insert or update of type, sort_order, url or delete
  on public.project_media
  for each row execute function public.project_media_sync_cover_url();

-- ---------------------------------------------------------------------------
-- 8 · Project amenities (§10)
-- ---------------------------------------------------------------------------
-- Shape copied from property_amenities deliberately: name text, unique per
-- parent, indexed both ways. The vocabulary in `amenities` is shared, so the
-- posting form and the project wizard offer the same list.
create table if not exists public.project_amenities (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  amenity_name text not null,
  created_at   timestamptz not null default now(),

  constraint project_amenities_name_check check (char_length(trim(amenity_name)) between 2 and 60),
  constraint project_amenities_unique unique (project_id, amenity_name)
);

create index if not exists project_amenities_project_idx on public.project_amenities (project_id);
create index if not exists project_amenities_name_idx on public.project_amenities (amenity_name);

-- ---------------------------------------------------------------------------
-- 9 · Buildings and floors (§11, §12)
-- ---------------------------------------------------------------------------
-- Created now, with no UI behind them until Phase 2, because `project_units`
-- cannot carry a nullable foreign key to a table that does not exist. Getting
-- the columns in place now is the difference between Phase 2 being UI work and
-- Phase 2 being another migration against a table that by then holds data.
create table if not exists public.project_buildings (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  name         text not null,
  code         text,
  total_floors smallint,
  total_units  integer,
  status       public.building_status not null default 'planned',
  sort_order   smallint not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint project_buildings_name_check check (char_length(trim(name)) between 1 and 80),
  constraint project_buildings_code_check check (code is null or char_length(trim(code)) between 1 and 20),
  constraint project_buildings_floors_check check (total_floors is null or total_floors between 0 and 200),
  constraint project_buildings_units_check check (total_units is null or total_units between 0 and 10000),
  constraint project_buildings_unique unique (project_id, name)
);

comment on table public.project_buildings is
  'Towers / blocks inside a project. Never required — a plot layout has none (§11).';

create index if not exists project_buildings_project_idx
  on public.project_buildings (project_id, sort_order, name);

drop trigger if exists project_buildings_set_updated_at on public.project_buildings;
create trigger project_buildings_set_updated_at
  before update on public.project_buildings
  for each row execute function public.set_updated_at();

create table if not exists public.project_floors (
  id           uuid primary key default gen_random_uuid(),
  building_id  uuid not null references public.project_buildings (id) on delete cascade,
  floor_number smallint not null,
  -- "Ground Floor", "1st Floor" — the label the brochure uses, which is not
  -- always derivable from the number (stilt, mezzanine, 13 skipped).
  display_name text,
  created_at   timestamptz not null default now(),

  constraint project_floors_number_check check (floor_number between -10 and 200),
  constraint project_floors_display_check check (display_name is null or char_length(display_name) <= 40),
  constraint project_floors_unique unique (building_id, floor_number)
);

create index if not exists project_floors_building_idx
  on public.project_floors (building_id, floor_number);

create or replace function public.project_building_project_id(p_building_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select project_id from public.project_buildings where id = p_building_id;
$$;

-- ---------------------------------------------------------------------------
-- 10 · Units and plots (§13, §15, §16)
-- ---------------------------------------------------------------------------
create table if not exists public.project_units (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  -- Both nullable. A plot in a layout has neither; a flat has both (§15 "Do
  -- not force building/floor structure on plots").
  building_id   uuid references public.project_buildings (id) on delete set null,
  floor_id      uuid references public.project_floors (id) on delete set null,

  unit_number   text not null,
  -- The brochure's own words: "2 BHK", "Type A", "Corner Plot". Free text
  -- because it is a label, not a taxonomy — the taxonomy is property_type.
  unit_type     text,
  property_type public.property_type not null,

  bedrooms      smallint,
  bathrooms     smallint,
  balconies     smallint,

  built_up_area numeric(12, 2),
  carpet_area   numeric(12, 2),
  land_area     numeric(12, 2),
  area_unit     public.area_unit not null default 'sqft',
  -- One comparable number for sorting and range filters, same as
  -- properties.area_sqft. A flat is measured built-up, a plot by land, so the
  -- coalesce picks whichever this row actually carries.
  area_sqft     numeric(16, 2) generated always as (
    public.to_sqft(coalesce(built_up_area, land_area, carpet_area), area_unit)
  ) stored,

  facing        public.facing_direction,
  floor_number  smallint,

  price            numeric(14, 2),
  -- Generated from the base columns rather than from area_sqft: PostgreSQL
  -- will not let one generated column read another, and to_sqft is IMMUTABLE
  -- so the expression can be repeated.
  price_per_sqft   numeric(14, 2) generated always as (
    case
      when price is not null
       and public.to_sqft(coalesce(built_up_area, land_area, carpet_area), area_unit) > 0
      then round(price / public.to_sqft(coalesce(built_up_area, land_area, carpet_area), area_unit), 2)
    end
  ) stored,
  maintenance_fee  numeric(12, 2),
  parking_details  text,

  -- ---- Plot specifics (§15) -------------------------------------------
  plot_dimensions text,
  road_width_ft   numeric(6, 2),
  is_corner       boolean not null default false,

  -- ---- Visual layout (§16) --------------------------------------------
  -- Stored now so the plot map is a rendering problem later rather than a
  -- migration against a populated table. Null means "not placed yet", which
  -- is every unit until somebody draws the layout.
  layout_row    smallint,
  layout_col    smallint,

  status        public.unit_status not null default 'available',
  description   text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint project_units_number_check check (char_length(trim(unit_number)) between 1 and 40),
  constraint project_units_unit_type_check check (unit_type is null or char_length(trim(unit_type)) between 1 and 60),
  constraint project_units_bedrooms_check check (bedrooms is null or bedrooms between 0 and 50),
  constraint project_units_bathrooms_check check (bathrooms is null or bathrooms between 0 and 50),
  constraint project_units_balconies_check check (balconies is null or balconies between 0 and 50),
  constraint project_units_built_up_check check (built_up_area is null or (built_up_area > 0 and built_up_area < 1e9)),
  constraint project_units_carpet_check   check (carpet_area is null or (carpet_area > 0 and carpet_area < 1e9)),
  constraint project_units_land_check     check (land_area is null or (land_area > 0 and land_area < 1e9)),
  constraint project_units_price_check    check (price is null or (price > 0 and price < 1e13)),
  constraint project_units_maintenance_check check (maintenance_fee is null or (maintenance_fee >= 0 and maintenance_fee < 1e7)),
  constraint project_units_floor_number_check check (floor_number is null or floor_number between -10 and 200),
  constraint project_units_road_width_check check (road_width_ft is null or (road_width_ft > 0 and road_width_ft < 500)),
  constraint project_units_dimensions_check check (plot_dimensions is null or char_length(trim(plot_dimensions)) <= 40),
  constraint project_units_parking_details_check check (parking_details is null or char_length(parking_details) <= 200),
  constraint project_units_description_check check (description is null or char_length(description) <= 2000),
  constraint project_units_layout_row_check check (layout_row is null or layout_row between 0 and 500),
  constraint project_units_layout_col_check check (layout_col is null or layout_col between 0 and 500),
  -- A floor only means something inside a building.
  constraint project_units_floor_needs_building_check
    check (floor_id is null or building_id is not null),
  constraint project_units_unique unique (project_id, unit_number)
);

comment on table public.project_units is
  'Inventory. One table for flats and plots: building_id/floor_id are NULL for a layout, and the layout_row/layout_col pair is what a visual plot map will read (§16).';
comment on column public.project_units.status is
  'Independent of projects.status — a project under construction can hold available, booked and sold units at once (§7).';

create index if not exists project_units_project_idx
  on public.project_units (project_id, status, unit_number);
create index if not exists project_units_building_idx
  on public.project_units (building_id, floor_number, unit_number) where building_id is not null;
create index if not exists project_units_floor_idx
  on public.project_units (floor_id) where floor_id is not null;
-- The inventory table's own filters (§27): configuration, price, area, facing.
create index if not exists project_units_available_idx
  on public.project_units (project_id, bedrooms, price) where status = 'available';
create index if not exists project_units_area_idx on public.project_units (project_id, area_sqft);
create index if not exists project_units_facing_idx on public.project_units (project_id, facing);
create index if not exists project_units_layout_idx
  on public.project_units (project_id, layout_row, layout_col) where layout_row is not null;

drop trigger if exists project_units_set_updated_at on public.project_units;
create trigger project_units_set_updated_at
  before update on public.project_units
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- A unit's building and floor must belong to the same project.
--
-- The foreign keys alone cannot say this: they prove the building exists, not
-- that it is this project's building. Without the check, Tower A of one
-- project could hold a unit belonging to another.
-- ---------------------------------------------------------------------------
create or replace function public.project_units_check_parentage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_building_project uuid;
  v_floor_building   uuid;
begin
  if new.building_id is not null then
    select project_id into v_building_project
    from public.project_buildings where id = new.building_id;

    if v_building_project is distinct from new.project_id then
      raise exception 'that building belongs to a different project' using errcode = '23514';
    end if;
  end if;

  if new.floor_id is not null then
    select building_id into v_floor_building
    from public.project_floors where id = new.floor_id;

    if v_floor_building is distinct from new.building_id then
      raise exception 'that floor belongs to a different building' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists project_units_check_parentage_trg on public.project_units;
create trigger project_units_check_parentage_trg
  before insert or update of project_id, building_id, floor_id on public.project_units
  for each row execute function public.project_units_check_parentage();

-- ---------------------------------------------------------------------------
-- Inventory counters.
--
-- Recomputed with one aggregate rather than incremented by deltas. A status
-- change is two counters moving at once, and a bulk unit import is hundreds of
-- them; a single GROUP BY per affected project is both simpler to read and
-- immune to the drift that a missed branch in a delta trigger produces.
-- ---------------------------------------------------------------------------
create or replace function public.project_recount_units(p_project_id uuid)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.projects p
     set units_total     = c.total,
         units_available = c.available,
         units_hold      = c.on_hold,
         units_booked    = c.booked,
         units_sold      = c.sold,
         units_blocked   = c.blocked
    from (
      select
        count(*)                                      as total,
        count(*) filter (where u.status = 'available') as available,
        count(*) filter (where u.status = 'hold')      as on_hold,
        count(*) filter (where u.status = 'booked')    as booked,
        count(*) filter (where u.status = 'sold')      as sold,
        count(*) filter (where u.status = 'blocked')   as blocked
      from public.project_units u
      where u.project_id = p_project_id
    ) c
   where p.id = p_project_id;
$$;

-- The two record variables are branched on `tg_op` rather than coalesced.
-- `OLD` is unassigned during INSERT and `NEW` during DELETE, and PL/pgSQL
-- raises "record new is not assigned yet" on the read — so a single expression
-- mentioning both would fail on every delete.
create or replace function public.project_units_sync_counters()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.project_recount_units(old.project_id);
    return null;
  end if;

  perform public.project_recount_units(new.project_id);

  -- A unit moved between projects leaves the old one's counters stale.
  if tg_op = 'UPDATE' and old.project_id is distinct from new.project_id then
    perform public.project_recount_units(old.project_id);
  end if;

  return null;
end;
$$;

drop trigger if exists project_units_sync_counters_trg on public.project_units;
create trigger project_units_sync_counters_trg
  after insert or update of status, project_id or delete
  on public.project_units
  for each row execute function public.project_units_sync_counters();

-- ---------------------------------------------------------------------------
-- 11 · Linking an individual listing to a project (§17)
-- ---------------------------------------------------------------------------
-- Both nullable, and they stay that way. §17: "Do not make projectId
-- mandatory" — an owner selling their own house has neither.
alter table public.properties
  add column if not exists project_id uuid references public.projects (id) on delete set null;

alter table public.properties
  add column if not exists organization_id uuid references public.organizations (id) on delete set null;

comment on column public.properties.project_id is
  'Optional. Set when this listing is a unit in a project; NULL for every independent listing (§17).';
comment on column public.properties.organization_id is
  'Optional. The company this listing was posted for. NULL when an individual owner posted it themselves.';

create index if not exists properties_project_idx
  on public.properties (project_id, created_at desc) where project_id is not null;
create index if not exists properties_organization_idx
  on public.properties (organization_id, created_at desc) where organization_id is not null;

-- ---------------------------------------------------------------------------
-- A seller can only attach their listing to an organization they act for.
--
-- A separate trigger rather than a sixth rewrite of properties_guard_write:
-- that function is 110 lines of safety-critical branching, has already been
-- replaced three times, and re-transcribing it to add two assignments is how
-- one of its rules quietly goes missing. Both columns are ones the main guard
-- never touches, so the two cannot disagree.
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER on purpose — see is_trusted_writer().
create or replace function public.properties_guard_project_link()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_trusted_writer() or public.is_admin() then
    return new;
  end if;

  -- Claiming a builder's project would borrow credibility the listing has not
  -- earned — the same reasoning as posted_by in migration 015.
  if new.organization_id is not null and not public.is_org_member(new.organization_id) then
    raise exception 'you are not a member of that organization' using errcode = '42501';
  end if;

  if new.project_id is not null
     and not public.can_manage_org_inventory(public.project_org_id(new.project_id)) then
    raise exception 'you cannot attach a listing to that project' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists properties_guard_project_link_trg on public.properties;
create trigger properties_guard_project_link_trg
  before insert or update of project_id, organization_id on public.properties
  for each row execute function public.properties_guard_project_link();

-- ---------------------------------------------------------------------------
-- 12 · Row Level Security
-- ---------------------------------------------------------------------------
alter table public.organizations       enable row level security;
alter table public.organization_members enable row level security;
alter table public.projects            enable row level security;
alter table public.project_media       enable row level security;
alter table public.project_amenities   enable row level security;
alter table public.project_buildings   enable row level security;
alter table public.project_floors      enable row level security;
alter table public.project_units       enable row level security;

-- ---- organizations --------------------------------------------------------
-- Public read, because a builder profile is a public page (§4). A suspended
-- company disappears from it; its own members and platform admins still see it
-- so they can act on the suspension.
drop policy if exists organizations_select_public on public.organizations;
create policy organizations_select_public on public.organizations
  for select to anon, authenticated
  using (
    verification_status <> 'suspended'
    or public.is_org_member(id)
    or public.is_admin()
  );

-- Self-onboarding, gated on the same completed profile that posting a listing
-- needs (§2). The per-user cap lives in the guard trigger.
drop policy if exists organizations_insert_self on public.organizations;
create policy organizations_insert_self on public.organizations
  for insert to authenticated
  with check (public.profile_is_complete() or public.is_admin());

drop policy if exists organizations_update_managers on public.organizations;
create policy organizations_update_managers on public.organizations
  for update to authenticated
  using (public.can_manage_org(id) or public.is_admin())
  with check (public.can_manage_org(id) or public.is_admin());

-- Deliberately admin-only. An organization with published projects and leads
-- behind it is not a row a member should be able to delete; suspension is the
-- reversible answer and it is what §34 offers.
drop policy if exists organizations_delete_admin on public.organizations;
create policy organizations_delete_admin on public.organizations
  for delete to authenticated
  using (public.is_admin());

-- ---- organization_members -------------------------------------------------
drop policy if exists organization_members_select on public.organization_members;
create policy organization_members_select on public.organization_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_org_member(organization_id) or public.is_admin());

drop policy if exists organization_members_insert on public.organization_members;
create policy organization_members_insert on public.organization_members
  for insert to authenticated
  with check (public.can_manage_org(organization_id) or public.is_admin());

drop policy if exists organization_members_update on public.organization_members;
create policy organization_members_update on public.organization_members
  for update to authenticated
  using (public.can_manage_org(organization_id) or public.is_admin())
  with check (public.can_manage_org(organization_id) or public.is_admin());

-- Leaving is allowed; the guard trigger decides whether removing somebody else
-- is, and the constraint trigger refuses to leave the org ownerless.
drop policy if exists organization_members_delete on public.organization_members;
create policy organization_members_delete on public.organization_members
  for delete to authenticated
  using (user_id = auth.uid() or public.can_manage_org(organization_id) or public.is_admin());

-- ---- projects -------------------------------------------------------------
-- Note what is absent: any availability or expiry condition. §18 requires a
-- completed, sold-out project to stay searchable, because it is the builder's
-- track record.
drop policy if exists projects_select_published on public.projects;
create policy projects_select_published on public.projects
  for select to anon, authenticated
  using (
    is_published
    and verification_status <> 'suspended'
    and exists (
      select 1 from public.organizations o
      where o.id = projects.organization_id and o.verification_status <> 'suspended'
    )
  );

drop policy if exists projects_select_own on public.projects;
create policy projects_select_own on public.projects
  for select to authenticated
  using (public.is_org_member(organization_id) or public.is_admin());

drop policy if exists projects_insert_managers on public.projects;
create policy projects_insert_managers on public.projects
  for insert to authenticated
  with check (
    (public.can_manage_org(organization_id) and public.profile_is_complete())
    or public.is_admin()
  );

-- MARKETING may edit the project record (§3); the guard trigger is what keeps
-- them out of the admin-managed columns.
drop policy if exists projects_update_managers on public.projects;
create policy projects_update_managers on public.projects
  for update to authenticated
  using (public.can_manage_org_marketing(organization_id) or public.is_admin())
  with check (public.can_manage_org_marketing(organization_id) or public.is_admin());

drop policy if exists projects_delete_managers on public.projects;
create policy projects_delete_managers on public.projects
  for delete to authenticated
  using (public.can_manage_org(organization_id) or public.is_admin());

-- ---- project_media / project_amenities ------------------------------------
-- Visibility follows the project; writes follow the marketing right.
drop policy if exists project_media_select on public.project_media;
create policy project_media_select on public.project_media
  for select to anon, authenticated
  using (public.can_view_project(project_id));

drop policy if exists project_media_write on public.project_media;
create policy project_media_write on public.project_media
  for all to authenticated
  using (public.can_manage_project(project_id))
  with check (public.can_manage_project(project_id));

drop policy if exists project_amenities_select on public.project_amenities;
create policy project_amenities_select on public.project_amenities
  for select to anon, authenticated
  using (public.can_view_project(project_id));

drop policy if exists project_amenities_write on public.project_amenities;
create policy project_amenities_write on public.project_amenities
  for all to authenticated
  using (public.can_manage_project(project_id))
  with check (public.can_manage_project(project_id));

-- ---- buildings / floors / units -------------------------------------------
drop policy if exists project_buildings_select on public.project_buildings;
create policy project_buildings_select on public.project_buildings
  for select to anon, authenticated
  using (public.can_view_project(project_id));

drop policy if exists project_buildings_write on public.project_buildings;
create policy project_buildings_write on public.project_buildings
  for all to authenticated
  using (public.can_manage_project_inventory(project_id))
  with check (public.can_manage_project_inventory(project_id));

drop policy if exists project_floors_select on public.project_floors;
create policy project_floors_select on public.project_floors
  for select to anon, authenticated
  using (public.can_view_project(public.project_building_project_id(building_id)));

drop policy if exists project_floors_write on public.project_floors;
create policy project_floors_write on public.project_floors
  for all to authenticated
  using (public.can_manage_project_inventory(public.project_building_project_id(building_id)))
  with check (public.can_manage_project_inventory(public.project_building_project_id(building_id)));

-- Inventory is public: §27's unit table is a buyer-facing feature, and a price
-- and availability per unit is the whole point of it.
drop policy if exists project_units_select on public.project_units;
create policy project_units_select on public.project_units
  for select to anon, authenticated
  using (public.can_view_project(project_id));

-- SALES_MANAGER may write here but not to the project record — the two rights
-- are separate functions for exactly this reason (§3).
drop policy if exists project_units_write on public.project_units;
create policy project_units_write on public.project_units
  for all to authenticated
  using (public.can_manage_project_inventory(project_id))
  with check (public.can_manage_project_inventory(project_id));

-- ---------------------------------------------------------------------------
-- 13 · Public projections
-- ---------------------------------------------------------------------------
-- A project card needs the builder's name and badge. Joining `organizations`
-- per card would work, but every public read then has to remember the
-- suspension condition; this states it once.
--
-- `security_invoker = false` for the same reason seller_public_profiles uses
-- it: the column list is curated, and there is nothing private in it.
create or replace view public.builder_public_profiles
with (security_invoker = false) as
select
  o.id,
  o.name,
  o.slug,
  o.org_types,
  o.logo_url,
  o.cover_image_url,
  o.about,
  o.established_year,
  o.city,
  o.state,
  o.locality,
  o.website,
  o.rera_number,
  o.verification_status,
  o.is_verified,
  o.projects_count,
  o.created_at as member_since
from public.organizations o
where o.verification_status <> 'suspended';

comment on view public.builder_public_profiles is
  'Non-sensitive organization fields safe for anonymous reads. No phone, no email, no GST — those stay behind the dashboard.';

-- Supabase grants ALL on new public objects to anon/authenticated, and a
-- single-table view is auto-updatable — leaving that in place would hand an
-- anonymous visitor an UPDATE path into `organizations` that runs as the view
-- owner and bypasses RLS entirely. Revoke, then grant back only SELECT.
revoke all on public.builder_public_profiles from public, anon, authenticated;
grant select on public.builder_public_profiles to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 14 · Storage — project media
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-media',
  'project-media',
  true,
  10485760, -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'application/pdf']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- `projects/<project_id>/<file>` → <uuid>, or NULL when the key does not
-- follow the convention. Returning NULL rather than raising matters: a policy
-- that errors on a malformed key surfaces as a 500, whereas NULL simply fails
-- the test and yields a clean 403. Same contract as
-- storage_path_property_id().
create or replace function public.storage_path_project_id(p_name text)
returns uuid
language plpgsql
immutable
as $$
declare
  v_parts text[] := string_to_array(coalesce(p_name, ''), '/');
  v_id    uuid;
begin
  if array_length(v_parts, 1) < 3 or v_parts[1] <> 'projects' then
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

drop policy if exists project_media_read on storage.objects;
create policy project_media_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'project-media');

drop policy if exists project_media_insert on storage.objects;
create policy project_media_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'project-media'
    and public.can_manage_project(public.storage_path_project_id(name))
  );

drop policy if exists project_media_update on storage.objects;
create policy project_media_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'project-media'
    and public.can_manage_project(public.storage_path_project_id(name))
  )
  with check (
    bucket_id = 'project-media'
    and public.can_manage_project(public.storage_path_project_id(name))
  );

drop policy if exists project_media_delete on storage.objects;
create policy project_media_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'project-media'
    and public.can_manage_project(public.storage_path_project_id(name))
  );

-- ---------------------------------------------------------------------------
-- 15 · Admin verification (§22, §34)
-- ---------------------------------------------------------------------------
-- RPCs rather than raw UPDATEs, for the same reason admin_approve_property is
-- one: the notification side effect must not be forgettable by a caller. And
-- because the guard triggers above refuse the write from anybody else, these
-- are the only way the badge can ever be awarded.
create or replace function public.admin_verify_organization(
  p_organization_id uuid,
  p_status          public.entity_verification_status,
  p_notes           text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_org    record;
  v_member record;
begin
  if not (public.is_admin() or public.is_service_role()) then
    raise exception 'admin privileges required' using errcode = '42501';
  end if;

  update public.organizations
     set verification_status = p_status,
         verified_at         = case when p_status = 'verified' then now() else verified_at end,
         admin_notes         = p_notes
   where id = p_organization_id
  returning id, name, slug into v_org;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  -- A suspended company's projects come off the market immediately, the same
  -- way admin_set_account_status pauses a suspended seller's listings.
  if p_status = 'suspended' then
    update public.projects set is_published = false
     where organization_id = p_organization_id and is_published;
  end if;

  for v_member in
    select user_id from public.organization_members
    where organization_id = p_organization_id
      and role in ('owner', 'admin')
      and status = 'active'
  loop
    perform public.create_notification(
      v_member.user_id,
      case p_status
        when 'verified'  then 'Builder profile verified'
        when 'rejected'  then 'Verification declined'
        when 'suspended' then 'Builder profile suspended'
        else 'Verification updated'
      end,
      coalesce(p_notes, v_org.name),
      'verification',
      '/dashboard/organization',
      jsonb_build_object('organization_id', v_org.id, 'verification_status', p_status)
    );
  end loop;

  return jsonb_build_object('ok', true, 'code', 'updated', 'organization_id', v_org.id);
end;
$$;

create or replace function public.admin_verify_project(
  p_project_id uuid,
  p_status     public.entity_verification_status,
  p_notes      text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_project record;
  v_member  record;
begin
  if not (public.is_admin() or public.is_service_role()) then
    raise exception 'admin privileges required' using errcode = '42501';
  end if;

  update public.projects
     set verification_status = p_status,
         verified_at         = case when p_status = 'verified' then now() else verified_at end,
         admin_notes         = p_notes,
         is_published        = case when p_status = 'suspended' then false else is_published end
   where id = p_project_id
  returning id, name, slug, organization_id into v_project;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  for v_member in
    select user_id from public.organization_members
    where organization_id = v_project.organization_id
      and role in ('owner', 'admin')
      and status = 'active'
  loop
    perform public.create_notification(
      v_member.user_id,
      case p_status
        when 'verified'  then 'Project verified'
        when 'rejected'  then 'Project verification declined'
        when 'suspended' then 'Project suspended'
        else 'Verification updated'
      end,
      coalesce(p_notes, v_project.name),
      'verification',
      '/dashboard/projects',
      jsonb_build_object('project_id', v_project.id, 'verification_status', p_status)
    );
  end loop;

  return jsonb_build_object('ok', true, 'code', 'updated', 'project_id', v_project.id);
end;
$$;

-- §8 — the second half of the construction-progress rule. The promoter reports
-- the number; this is the only thing that can mark it verified.
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
     set progress_verification = case when p_verified then 'admin_verified' else 'promoter_reported' end
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
-- Project view counter. Mirrors record_property_view: a definer routine so the
-- counter cannot be inflated by a client UPDATE, which the guard trigger pins.
-- ---------------------------------------------------------------------------
create or replace function public.record_project_view(p_project_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.project_is_live(p_project_id) then
    return;
  end if;
  update public.projects set views_count = views_count + 1 where id = p_project_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 16 · Grants
-- ---------------------------------------------------------------------------
revoke all on function public.admin_verify_organization(uuid, public.entity_verification_status, text) from public, anon;
revoke all on function public.admin_verify_project(uuid, public.entity_verification_status, text)      from public, anon;
revoke all on function public.admin_verify_project_progress(uuid, boolean)                             from public, anon;

grant execute on function public.admin_verify_organization(uuid, public.entity_verification_status, text) to authenticated;
grant execute on function public.admin_verify_project(uuid, public.entity_verification_status, text)      to authenticated;
grant execute on function public.admin_verify_project_progress(uuid, boolean)                             to authenticated;

-- Anonymous visitors browse projects, so the view counter has to be callable
-- without a session — exactly as record_property_view is.
grant execute on function public.record_project_view(uuid) to anon, authenticated;


-- ===========================================================================
-- 99Estate — 030 · One lead inbox, covering projects and units too
-- ---------------------------------------------------------------------------
-- §29: every project and property enquiry becomes a lead. The `leads` table
-- already existed, but it was shaped around exactly one way of producing a
-- lead — a settled ₹9 contact unlock:
--
--   contact_unlock_id  uuid NOT NULL UNIQUE references contact_unlocks
--   property_id        uuid NOT NULL
--   seller_id          uuid NOT NULL
--
-- A buyer asking a builder about unit A101 has no unlock, no listing row and
-- no single seller — the counterparty is an organization. So all three
-- columns become nullable and the table gains the project side of the
-- relationship.
--
-- What deliberately does NOT change, because it is where the money lives:
--
--   * The UNIQUE on `contact_unlock_id` stays. PostgreSQL treats NULLs as
--     distinct, so unlock-driven leads keep their 1:1 idempotency under
--     webhook replay while project leads sit alongside them as NULLs.
--   * Rule 4 (two free unlocks per IST day), Rule 6 (never charged twice) and
--     Rule 7 (no unlock without server-side authorisation) are all enforced in
--     `contact_unlocks`, not here. Nothing below touches them.
--   * `leads_guard_write`'s INSERT branch still refuses every client INSERT.
--     Project enquiries arrive through submit_project_enquiry(), which is
--     SECURITY DEFINER and therefore a trusted writer — so "leads are created
--     automatically" remains true rather than becoming a convention.
--
-- And the one privacy rule that shapes the whole design: Rule 8 says a phone
-- number is revealed only through a settled unlock. A project enquiry
-- therefore carries the name and number the *buyer typed into the enquiry
-- form*, stored on the lead row. `profiles.mobile_number` is never read
-- across users for a project lead, and the rebuilt `lead_details` view below
-- is explicit about which of the two a given row exposes.
--
-- Re-runnable: applied by pasting into the Supabase SQL Editor.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1 · Where a lead came from
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.lead_source as enum (
    'contact_unlock',   -- a buyer unlocked a seller's number (the original path)
    'project_enquiry',  -- "Contact builder" on a project page
    'unit_enquiry',     -- "Interested in A101" — §29's worked example
    'site_visit',       -- a site-visit request, which Phase 3 will raise
    'admin'             -- entered by an admin on somebody's behalf
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 2 · Columns
-- ---------------------------------------------------------------------------
alter table public.leads
  add column if not exists project_id      uuid references public.projects (id) on delete cascade,
  add column if not exists unit_id         uuid references public.project_units (id) on delete set null,
  add column if not exists organization_id uuid references public.organizations (id) on delete cascade,
  add column if not exists source          public.lead_source not null default 'contact_unlock',
  add column if not exists assigned_to     uuid references public.profiles (id) on delete set null,
  add column if not exists contact_name    text,
  add column if not exists contact_mobile  text,
  add column if not exists message         text;

comment on column public.leads.contact_mobile is
  'The number the buyer typed into the enquiry form. Separate from profiles.mobile_number on purpose: Rule 8 reserves the profile number for a settled unlock, so a project lead shows only what the buyer volunteered.';
comment on column public.leads.unit_id is
  'ON DELETE SET NULL rather than CASCADE: a sold unit being removed from inventory must not delete the enquiry that produced the sale.';
comment on column public.leads.source is
  'Defaults to contact_unlock so every pre-existing row keeps its true provenance without a backfill.';

-- `unit_id` referencing project_units means this migration has to run after
-- 029. Stated as a comment rather than enforced, because the timestamp
-- ordering already does it and a paste in the wrong order fails loudly on the
-- missing table.

alter table public.leads alter column contact_unlock_id drop not null;
alter table public.leads alter column property_id       drop not null;
alter table public.leads alter column seller_id         drop not null;

-- ---------------------------------------------------------------------------
-- 3 · Integrity
-- ---------------------------------------------------------------------------
-- Dropping three NOT NULLs removes three guarantees, so each is replaced by a
-- rule about the shape of a whole row rather than one column.

-- A lead has to be about something.
alter table public.leads drop constraint if exists leads_has_a_target_check;
alter table public.leads
  add constraint leads_has_a_target_check
  check (property_id is not null or project_id is not null);

-- An unlock-driven lead is exactly the rows with an unlock behind them, and
-- those are exactly the rows with a listing and a seller. This is what stops a
-- project lead being mislabelled as a paid one — which would make it look, in
-- the admin revenue reports, as though ₹9 had changed hands.
alter table public.leads drop constraint if exists leads_unlock_source_check;
alter table public.leads
  add constraint leads_unlock_source_check
  check (
    (source = 'contact_unlock' and contact_unlock_id is not null
       and property_id is not null and seller_id is not null)
    or (source <> 'contact_unlock' and contact_unlock_id is null)
  );

-- Everything that is not an unlock belongs to an organization, because that is
-- who answers it.
alter table public.leads drop constraint if exists leads_project_needs_org_check;
alter table public.leads
  add constraint leads_project_needs_org_check
  check (project_id is null or organization_id is not null);

alter table public.leads drop constraint if exists leads_unit_needs_project_check;
alter table public.leads
  add constraint leads_unit_needs_project_check
  check (unit_id is null or project_id is not null);

alter table public.leads drop constraint if exists leads_contact_name_check;
alter table public.leads
  add constraint leads_contact_name_check
  check (contact_name is null or char_length(trim(contact_name)) between 2 and 120);

-- Same bare-10-digit shape as profiles.mobile_number, so the two render
-- identically as +91 XXXXX XXXXX.
alter table public.leads drop constraint if exists leads_contact_mobile_check;
alter table public.leads
  add constraint leads_contact_mobile_check
  check (contact_mobile is null or contact_mobile ~ '^[6-9][0-9]{9}$');

alter table public.leads drop constraint if exists leads_message_check;
alter table public.leads
  add constraint leads_message_check
  check (message is null or char_length(message) <= 2000);

create index if not exists leads_organization_idx
  on public.leads (organization_id, created_at desc) where organization_id is not null;
create index if not exists leads_organization_status_idx
  on public.leads (organization_id, status, created_at desc) where organization_id is not null;
create index if not exists leads_project_idx
  on public.leads (project_id, created_at desc) where project_id is not null;
create index if not exists leads_unit_idx
  on public.leads (unit_id, created_at desc) where unit_id is not null;
create index if not exists leads_assigned_idx
  on public.leads (assigned_to, status, created_at desc) where assigned_to is not null;

-- One enquiry per buyer per thing enquired about.
--
-- Without this, "Send enquiry" pressed three times is three leads and the
-- builder's inbox is noise. `coalesce` on `unit_id` is what makes it bite: a
-- plain UNIQUE would treat every project-level enquiry (unit_id NULL) as
-- distinct from every other, since NULLs do not collide.
create unique index if not exists leads_one_enquiry_per_target_idx
  on public.leads (buyer_id, project_id, coalesce(unit_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where project_id is not null;

-- ---------------------------------------------------------------------------
-- 4 · Counters
-- ---------------------------------------------------------------------------
-- The original incremented properties.leads_count unconditionally. With a
-- nullable property_id that UPDATE now matches no rows for a project lead,
-- which is harmless — but the project's own counter would never move. Both
-- sides are handled here.
create or replace function public.leads_sync_counter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.property_id is not null then
      update public.properties set leads_count = leads_count + 1 where id = new.property_id;
    end if;
    if new.project_id is not null then
      update public.projects set leads_count = leads_count + 1 where id = new.project_id;
    end if;
  elsif tg_op = 'DELETE' then
    if old.property_id is not null then
      update public.properties set leads_count = greatest(0, leads_count - 1) where id = old.property_id;
    end if;
    if old.project_id is not null then
      update public.projects set leads_count = greatest(0, leads_count - 1) where id = old.project_id;
    end if;
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5 · Write guard
-- ---------------------------------------------------------------------------
-- The INSERT branch is unchanged in effect: still no client-created leads.
-- The UPDATE branch is what has to grow, because `auth.uid() = old.seller_id`
-- is not an answer for a lead whose counterparty is a company — seller_id is
-- NULL on those, and `auth.uid() is distinct from null` is true, so the old
-- guard would have rejected every project lead update.
--
-- SECURITY INVOKER on purpose — see is_trusted_writer(). That is what makes
-- "leads are created automatically" enforceable: submit_project_enquiry() and
-- request_contact_unlock() are definer routines so their INSERTs pass, and a
-- direct request from `authenticated` does not.
create or replace function public.leads_guard_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_may_manage boolean;
begin
  if public.is_trusted_writer() or public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'leads are created automatically by a contact unlock or an enquiry'
      using errcode = '42501';
  end if;

  -- Who owns the pipeline state of this lead:
  --   an individual listing  → its seller, exactly as before
  --   a project enquiry      → owner / admin / sales manager of the company,
  --                            or the executive it is assigned to (§3)
  v_may_manage :=
       (old.seller_id is not null and auth.uid() = old.seller_id)
    or (old.organization_id is not null and public.can_manage_org_inventory(old.organization_id))
    or (old.assigned_to is not null and auth.uid() = old.assigned_to);

  if not v_may_manage then
    raise exception 'only the listing owner or the organization can update this lead'
      using errcode = '42501';
  end if;

  if new.property_id       is distinct from old.property_id
     or new.seller_id      is distinct from old.seller_id
     or new.buyer_id       is distinct from old.buyer_id
     or new.contact_unlock_id is distinct from old.contact_unlock_id
     or new.project_id     is distinct from old.project_id
     or new.unit_id        is distinct from old.unit_id
     or new.organization_id is distinct from old.organization_id
     or new.source         is distinct from old.source
     -- The buyer's own words and number. A builder must not be able to edit
     -- the contact details they were given and then dispute what was sent.
     or new.contact_name   is distinct from old.contact_name
     or new.contact_mobile is distinct from old.contact_mobile
     or new.message        is distinct from old.message
     or new.created_at     is distinct from old.created_at then
    raise exception 'only status, notes and assignment can be updated on a lead'
      using errcode = '42501';
  end if;

  -- A sales executive may work the lead they hold but not hand it to someone
  -- else; reassignment is a manager's call.
  if new.assigned_to is distinct from old.assigned_to then
    if not (
         (old.seller_id is not null and auth.uid() = old.seller_id)
      or (old.organization_id is not null and public.can_manage_org_inventory(old.organization_id))
    ) then
      raise exception 'only a manager can reassign a lead' using errcode = '42501';
    end if;
    -- And only to somebody who actually works there.
    if new.assigned_to is not null
       and old.organization_id is not null
       and not public.is_org_member(old.organization_id, new.assigned_to) then
      raise exception 'a lead can only be assigned to a member of the organization'
        using errcode = '42501';
    end if;
  end if;

  if new.status is distinct from old.status then
    new.last_status_change_at := now();
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6 · Row Level Security
-- ---------------------------------------------------------------------------
-- The organization is a third kind of participant, and a sales executive sees
-- the leads assigned to them (§3) — which the org-member clause already
-- covers, but stating it separately is what lets a VIEWER-turned-executive
-- keep their own pipeline if the role is narrowed later.
drop policy if exists leads_select_participants on public.leads;
create policy leads_select_participants on public.leads
  for select to authenticated
  using (
    seller_id = auth.uid()
    or buyer_id = auth.uid()
    or assigned_to = auth.uid()
    or (organization_id is not null and public.is_org_member(organization_id))
    or public.is_admin()
  );

drop policy if exists leads_update_seller on public.leads;
create policy leads_update_seller on public.leads
  for update to authenticated
  using (
    seller_id = auth.uid()
    or assigned_to = auth.uid()
    or (organization_id is not null and public.can_manage_org_inventory(organization_id))
    or public.is_admin()
  )
  with check (
    seller_id = auth.uid()
    or assigned_to = auth.uid()
    or (organization_id is not null and public.can_manage_org_inventory(organization_id))
    or public.is_admin()
  );

-- ---------------------------------------------------------------------------
-- 7 · The lead inbox
-- ---------------------------------------------------------------------------
-- Dropped and rebuilt rather than replaced: the joins change from INNER to
-- LEFT, and `create or replace view` is not the tool for restructuring a FROM
-- clause.
--
-- Every INNER JOIN in the original was a filter nobody intended. A project
-- lead has no row in `properties` and none in `contact_unlocks`, so under the
-- old definition it would have been silently dropped from the very inbox it
-- was created for.
--
-- `security_invoker = false` is what lets this view read a phone number its
-- caller could not select directly. That is safe only because the WHERE clause
-- hard-codes the authorisation test and the column list is curated — so the
-- CASE on buyer_mobile is load-bearing, not cosmetic.
drop view if exists public.lead_details;

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

  l.project_id,
  l.unit_id,
  l.organization_id,
  l.source,
  l.assigned_to,
  l.message,

  b.full_name  as buyer_name,
  b.avatar_url as buyer_avatar,

  -- Rule 8, in one expression.
  --
  -- With an unlock behind the lead, the buyer paid (or spent a free credit) to
  -- reveal the *seller's* number and the seller gets theirs in return — that
  -- is the existing bargain and `profiles.mobile_number` is the right source.
  -- Without one, the only number anybody is entitled to is the one the buyer
  -- typed into the enquiry form. Never both, and never the profile number by
  -- default.
  case
    when l.contact_unlock_id is not null then b.mobile_number
    else l.contact_mobile
  end as buyer_mobile,
  coalesce(l.contact_name, b.full_name) as contact_display_name,

  p.title    as property_title,
  p.slug     as property_slug,
  p.public_code as property_public_code,
  p.city     as property_city,
  p.locality as property_locality,
  p.price    as property_price,
  p.listing_type,

  pr.name    as project_name,
  pr.slug    as project_slug,
  pr.city    as project_city,
  pr.locality as project_locality,
  u.unit_number,
  u.unit_type,
  u.price    as unit_price,
  o.name     as organization_name,
  o.slug     as organization_slug,

  cu.is_free as unlock_was_free,
  cu.amount  as unlock_amount,
  cu.unlocked_at
from public.leads l
join public.profiles b              on b.id = l.buyer_id
left join public.properties p       on p.id = l.property_id
left join public.projects pr        on pr.id = l.project_id
left join public.project_units u    on u.id = l.unit_id
left join public.organizations o    on o.id = l.organization_id
left join public.contact_unlocks cu on cu.id = l.contact_unlock_id
where l.seller_id = auth.uid()
   or l.assigned_to = auth.uid()
   or (l.organization_id is not null and public.is_org_member(l.organization_id))
   or public.is_admin();

comment on view public.lead_details is
  'Lead inbox for a listing owner or an organization, including the buyer contact they are entitled to. Filtered to auth.uid() inside the view; buyer_mobile comes from the profile only when a settled unlock backs the lead.';

revoke all on public.lead_details from public, anon, authenticated;
grant select on public.lead_details to authenticated;

-- ---------------------------------------------------------------------------
-- 8 · Raising a project enquiry (§29, §30)
-- ---------------------------------------------------------------------------
-- A SECURITY DEFINER RPC rather than an INSERT policy, for three reasons that
-- an RLS policy cannot cover on its own: the lead has to be stamped with the
-- organization that owns the project (which the client must not get to choose),
-- the builder has to be notified, and pressing the button twice must not
-- produce two leads.
--
-- Requires a session. An anonymous enquiry would mean a lead with no
-- `buyer_id`, and `leads.buyer_id` is NOT NULL — which is a constraint worth
-- keeping, because an unauthenticated enquiry form is a spam endpoint.
create or replace function public.submit_project_enquiry(
  p_project_id     uuid,
  p_unit_id        uuid default null,
  p_contact_name   text default null,
  p_contact_mobile text default null,
  p_message        text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_project record;
  v_mobile  text := regexp_replace(coalesce(p_contact_mobile, ''), '\D', '', 'g');
  v_name    text := nullif(trim(coalesce(p_contact_name, '')), '');
  v_lead_id uuid;
  v_source  public.lead_source;
  v_member  record;
  v_what    text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'sign_in_required');
  end if;

  -- +91 and 0 prefixes are what people actually type.
  if char_length(v_mobile) > 10 then
    v_mobile := right(v_mobile, 10);
  end if;
  if v_mobile !~ '^[6-9][0-9]{9}$' then
    return jsonb_build_object('ok', false, 'code', 'mobile_invalid');
  end if;
  if v_name is null or char_length(v_name) < 2 then
    return jsonb_build_object('ok', false, 'code', 'name_required');
  end if;

  -- Resolved here, not accepted from the caller: this is what stops an
  -- enquiry being filed against somebody else's company.
  select p.id, p.name, p.slug, p.organization_id
    into v_project
  from public.projects p
  where p.id = p_project_id;

  if not found or not public.project_is_live(p_project_id) then
    return jsonb_build_object('ok', false, 'code', 'project_unavailable');
  end if;

  if p_unit_id is not null then
    if not exists (
      select 1 from public.project_units u
      where u.id = p_unit_id and u.project_id = p_project_id
    ) then
      return jsonb_build_object('ok', false, 'code', 'unit_not_in_project');
    end if;
    v_source := 'unit_enquiry';
  else
    v_source := 'project_enquiry';
  end if;

  -- A member enquiring about their own project would put a lead in their own
  -- inbox. Mirrors contact_unlocks_not_own_listing_check.
  if public.is_org_member(v_project.organization_id, v_uid) then
    return jsonb_build_object('ok', false, 'code', 'own_project');
  end if;

  -- Pressing the button again updates the enquiry instead of duplicating it,
  -- and deliberately does not reopen a lead the builder has already worked:
  -- `status` is theirs, not the buyer's.
  insert into public.leads (
    project_id, unit_id, organization_id, buyer_id,
    source, contact_name, contact_mobile, message, status
  )
  values (
    p_project_id, p_unit_id, v_project.organization_id, v_uid,
    v_source, v_name, v_mobile, nullif(trim(coalesce(p_message, '')), ''), 'new'
  )
  on conflict (buyer_id, project_id, coalesce(unit_id, '00000000-0000-0000-0000-000000000000'::uuid))
    where project_id is not null
  do update set
    contact_name   = excluded.contact_name,
    contact_mobile = excluded.contact_mobile,
    -- An empty box on a repeat enquiry must not wipe what was said the first
    -- time. `leads` unqualified is the pre-existing row, which is the only
    -- spelling ON CONFLICT accepts here.
    message        = coalesce(excluded.message, leads.message),
    updated_at     = now()
  returning id into v_lead_id;

  v_what := case
    when p_unit_id is null then v_project.name
    else (select u.unit_number || ' · ' || v_project.name
          from public.project_units u where u.id = p_unit_id)
  end;

  for v_member in
    select user_id from public.organization_members
    where organization_id = v_project.organization_id
      and role in ('owner', 'admin', 'sales_manager')
      and status = 'active'
  loop
    perform public.create_notification(
      v_member.user_id,
      'New enquiry',
      v_name || ' enquired about ' || v_what || '.',
      'new_lead',
      '/dashboard/leads',
      jsonb_build_object('lead_id', v_lead_id, 'project_id', p_project_id, 'unit_id', p_unit_id)
    );
  end loop;

  return jsonb_build_object('ok', true, 'code', 'received', 'lead_id', v_lead_id);
end;
$$;

revoke all on function public.submit_project_enquiry(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.submit_project_enquiry(uuid, uuid, text, text, text) to authenticated;
