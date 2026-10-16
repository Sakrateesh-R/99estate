-- 99Estate PENDING SCHEMA CHANGE: migrations 029 and 030, plus an RLS audit
--
-- HOW TO RUN THIS
-- Open the Supabase Dashboard, go to SQL Editor, paste this whole file and
-- press Run. It has to be executed by something that understands
-- dollar-quoted function bodies. Do NOT feed it to a tool that splits SQL on
-- semicolons: the function bodies below contain semicolons of their own and
-- will be torn open, which is what produced the earlier run of errors.
--
-- Every comment from the source migrations has been removed on purpose. The
-- committed files under supabase/migrations hold the full design notes, and
-- those notes contain apostrophes and semicolons that desynchronise naive SQL
-- splitters. This execution copy carries none of them.
--
-- It is safe to run more than once. Every statement is written to be
-- re-runnable, and the Editor wraps the paste in a single transaction, so a
-- failure anywhere rolls the whole thing back and leaves nothing half applied.
--
-- PART 1  organizations, projects, media, amenities, buildings, floors, units
-- PART 2  the leads table learns to hold a project enquiry
-- PART 3  row level security, enforced and then audited
--
-- PART 3 ends in a SELECT. Read its output before closing the tab. Any row
-- where rls_enabled is false, or where policies is 0, wants a decision.

-- ===========================================================================
-- PART 1  Organizations, projects and project inventory
-- ===========================================================================

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

do $$ begin
  create type public.progress_verification_status as enum ('promoter_reported', 'admin_verified');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.building_status as enum (
    'planned', 'under_construction', 'completed', 'sold_out'
  );
exception when duplicate_object then null; end $$;

insert into public.app_settings (key, value, description, is_public) values
  ('max_organizations_per_user', '3'::jsonb,
   'How many organizations one account may create. Anti-spam, not a product limit.', false),
  ('max_media_per_project', '40'::jsonb,
   'Upload cap per project across gallery, floor plans, master plan and construction updates.', true)
on conflict (key) do nothing;

create table if not exists public.organizations (
  id                  uuid primary key default gen_random_uuid(),

  created_by          uuid references public.profiles (id) on delete set null,

  name                text not null,
  slug                text not null unique,

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

  gst_number          text,
  rera_number         text,

  verification_status public.entity_verification_status not null default 'unverified',

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

create or replace function public.can_manage_org(p_org_id uuid, p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.org_role_of(p_org_id, p_uid) in ('owner', 'admin');
$$;

create or replace function public.can_manage_org_inventory(p_org_id uuid, p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.org_role_of(p_org_id, p_uid) in ('owner', 'admin', 'sales_manager');
$$;

create or replace function public.can_manage_org_marketing(p_org_id uuid, p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.org_role_of(p_org_id, p_uid) in ('owner', 'admin', 'sales_manager', 'marketing');
$$;

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

drop trigger if exists organization_members_guard_write_trg on public.organization_members;
create trigger organization_members_guard_write_trg
  before insert or update or delete on public.organization_members
  for each row execute function public.organization_members_guard_write();

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

create table if not exists public.projects (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations (id) on delete cascade,
  created_by          uuid references public.profiles (id) on delete set null,

  name                text not null,
  slug                text not null unique,

  project_code        text,
  description         text,

  project_type        public.project_type not null,

  property_types      public.property_type[] not null default '{}',
  status              public.project_status not null default 'upcoming',

  address             text,
  locality            text,
  city                text not null,
  district            text,
  state               text,
  pincode             text,
  latitude            numeric(9, 6),
  longitude           numeric(9, 6),
  map_url             text,

  total_area          numeric(12, 2),
  total_area_unit     public.area_unit not null default 'acre',
  total_area_sqft     numeric(16, 2) generated always as (public.to_sqft(total_area, total_area_unit)) stored,

  total_units         integer,

  units_total         integer not null default 0,
  units_available     integer not null default 0,
  units_hold          integer not null default 0,
  units_booked        integer not null default 0,
  units_sold          integer not null default 0,
  units_blocked       integer not null default 0,

  price_min           numeric(14, 2),
  price_max           numeric(14, 2),

  bedroom_options     smallint[] not null default '{}',

  launch_date              date,
  expected_completion_date date,
  actual_completion_date   date,

  construction_progress_percentage smallint,
  construction_progress_note       text,
  last_progress_update             timestamptz,
  progress_updated_by              uuid references public.profiles (id) on delete set null,

  progress_verification            public.progress_verification_status
                                     not null default 'promoter_reported',

  rera_number         text,
  verification_status public.entity_verification_status not null default 'unverified',
  is_verified         boolean generated always as (verification_status = 'verified') stored,
  verified_at         timestamptz,
  admin_notes         text,
  is_featured         boolean not null default false,

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

  constraint projects_map_url_check check (
    map_url is null
    or (
      length(map_url) <= 2048
      and map_url ~ '^https://(maps\.app\.goo\.gl|(www\.)?goo\.gl|(www\.|maps\.)?google\.(com|co\.in))(/|$)'
    )
  ),

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

  else
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

  if tg_op = 'UPDATE'
     and new.construction_progress_percentage is distinct from old.construction_progress_percentage then
    new.last_progress_update := now();
    new.progress_updated_by  := coalesce(auth.uid(), new.progress_updated_by);
  end if;

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

create table if not exists public.project_media (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  type         public.project_media_type not null default 'gallery',

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

create unique index if not exists project_media_single_cover_idx
  on public.project_media (project_id)
  where type = 'cover';

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

create table if not exists public.project_units (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,

  building_id   uuid references public.project_buildings (id) on delete set null,
  floor_id      uuid references public.project_floors (id) on delete set null,

  unit_number   text not null,

  unit_type     text,
  property_type public.property_type not null,

  bedrooms      smallint,
  bathrooms     smallint,
  balconies     smallint,

  built_up_area numeric(12, 2),
  carpet_area   numeric(12, 2),
  land_area     numeric(12, 2),
  area_unit     public.area_unit not null default 'sqft',

  area_sqft     numeric(16, 2) generated always as (
    public.to_sqft(coalesce(built_up_area, land_area, carpet_area), area_unit)
  ) stored,

  facing        public.facing_direction,
  floor_number  smallint,

  price            numeric(14, 2),

  price_per_sqft   numeric(14, 2) generated always as (
    case
      when price is not null
       and public.to_sqft(coalesce(built_up_area, land_area, carpet_area), area_unit) > 0
      then round(price / public.to_sqft(coalesce(built_up_area, land_area, carpet_area), area_unit), 2)
    end
  ) stored,
  maintenance_fee  numeric(12, 2),
  parking_details  text,

  plot_dimensions text,
  road_width_ft   numeric(6, 2),
  is_corner       boolean not null default false,

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

create or replace function public.properties_guard_project_link()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_trusted_writer() or public.is_admin() then
    return new;
  end if;

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

alter table public.organizations       enable row level security;
alter table public.organization_members enable row level security;
alter table public.projects            enable row level security;
alter table public.project_media       enable row level security;
alter table public.project_amenities   enable row level security;
alter table public.project_buildings   enable row level security;
alter table public.project_floors      enable row level security;
alter table public.project_units       enable row level security;

drop policy if exists organizations_select_public on public.organizations;
create policy organizations_select_public on public.organizations
  for select to anon, authenticated
  using (
    verification_status <> 'suspended'
    or public.is_org_member(id)
    or public.is_admin()
  );

drop policy if exists organizations_insert_self on public.organizations;
create policy organizations_insert_self on public.organizations
  for insert to authenticated
  with check (public.profile_is_complete() or public.is_admin());

drop policy if exists organizations_update_managers on public.organizations;
create policy organizations_update_managers on public.organizations
  for update to authenticated
  using (public.can_manage_org(id) or public.is_admin())
  with check (public.can_manage_org(id) or public.is_admin());

drop policy if exists organizations_delete_admin on public.organizations;
create policy organizations_delete_admin on public.organizations
  for delete to authenticated
  using (public.is_admin());

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

drop policy if exists organization_members_delete on public.organization_members;
create policy organization_members_delete on public.organization_members
  for delete to authenticated
  using (user_id = auth.uid() or public.can_manage_org(organization_id) or public.is_admin());

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

drop policy if exists projects_update_managers on public.projects;
create policy projects_update_managers on public.projects
  for update to authenticated
  using (public.can_manage_org_marketing(organization_id) or public.is_admin())
  with check (public.can_manage_org_marketing(organization_id) or public.is_admin());

drop policy if exists projects_delete_managers on public.projects;
create policy projects_delete_managers on public.projects
  for delete to authenticated
  using (public.can_manage_org(organization_id) or public.is_admin());

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

drop policy if exists project_units_select on public.project_units;
create policy project_units_select on public.project_units
  for select to anon, authenticated
  using (public.can_view_project(project_id));

drop policy if exists project_units_write on public.project_units;
create policy project_units_write on public.project_units
  for all to authenticated
  using (public.can_manage_project_inventory(project_id))
  with check (public.can_manage_project_inventory(project_id));

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

revoke all on public.builder_public_profiles from public, anon, authenticated;
grant select on public.builder_public_profiles to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-media',
  'project-media',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'application/pdf']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

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

revoke all on function public.admin_verify_organization(uuid, public.entity_verification_status, text) from public, anon;
revoke all on function public.admin_verify_project(uuid, public.entity_verification_status, text)      from public, anon;
revoke all on function public.admin_verify_project_progress(uuid, boolean)                             from public, anon;

grant execute on function public.admin_verify_organization(uuid, public.entity_verification_status, text) to authenticated;
grant execute on function public.admin_verify_project(uuid, public.entity_verification_status, text)      to authenticated;
grant execute on function public.admin_verify_project_progress(uuid, boolean)                             to authenticated;

grant execute on function public.record_project_view(uuid) to anon, authenticated;

-- ===========================================================================
-- PART 2  One lead inbox, covering projects and units too
-- ===========================================================================

do $$ begin
  create type public.lead_source as enum (
    'contact_unlock',
    'project_enquiry',
    'unit_enquiry',
    'site_visit',
    'admin'
  );
exception when duplicate_object then null; end $$;

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

alter table public.leads alter column contact_unlock_id drop not null;
alter table public.leads alter column property_id       drop not null;
alter table public.leads alter column seller_id         drop not null;

alter table public.leads drop constraint if exists leads_has_a_target_check;
alter table public.leads
  add constraint leads_has_a_target_check
  check (property_id is not null or project_id is not null);

alter table public.leads drop constraint if exists leads_unlock_source_check;
alter table public.leads
  add constraint leads_unlock_source_check
  check (
    (source = 'contact_unlock' and contact_unlock_id is not null
       and property_id is not null and seller_id is not null)
    or (source <> 'contact_unlock' and contact_unlock_id is null)
  );

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

create unique index if not exists leads_one_enquiry_per_target_idx
  on public.leads (buyer_id, project_id, coalesce(unit_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where project_id is not null;

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

     or new.contact_name   is distinct from old.contact_name
     or new.contact_mobile is distinct from old.contact_mobile
     or new.message        is distinct from old.message
     or new.created_at     is distinct from old.created_at then
    raise exception 'only status, notes and assignment can be updated on a lead'
      using errcode = '42501';
  end if;

  if new.assigned_to is distinct from old.assigned_to then
    if not (
         (old.seller_id is not null and auth.uid() = old.seller_id)
      or (old.organization_id is not null and public.can_manage_org_inventory(old.organization_id))
    ) then
      raise exception 'only a manager can reassign a lead' using errcode = '42501';
    end if;

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

  if char_length(v_mobile) > 10 then
    v_mobile := right(v_mobile, 10);
  end if;
  if v_mobile !~ '^[6-9][0-9]{9}$' then
    return jsonb_build_object('ok', false, 'code', 'mobile_invalid');
  end if;
  if v_name is null or char_length(v_name) < 2 then
    return jsonb_build_object('ok', false, 'code', 'name_required');
  end if;

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

  if public.is_org_member(v_project.organization_id, v_uid) then
    return jsonb_build_object('ok', false, 'code', 'own_project');
  end if;

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

-- ===========================================================================
-- PART 3  Row level security
-- ===========================================================================

-- 3a  The eight new tables. Stated again here so this section can be read on
--     its own without going back through PART 1.

alter table public.organizations        enable row level security;
alter table public.organization_members enable row level security;
alter table public.projects             enable row level security;
alter table public.project_media        enable row level security;
alter table public.project_amenities    enable row level security;
alter table public.project_buildings    enable row level security;
alter table public.project_floors       enable row level security;
alter table public.project_units        enable row level security;

-- 3b  Every other table in the public schema.
--
--     Enabling RLS on a table that carries no policy denies all access to it,
--     including to the running site. So this switches RLS on only where at
--     least one policy already exists, and raises a warning for anything else
--     rather than quietly taking a live feature offline.

do $$
declare
  r       record;
  n       integer;
  enabled integer := 0;
  flagged integer := 0;
begin
  for r in
    select c.oid, c.relname
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public'
      and c.relkind = 'r'
      and not c.relrowsecurity
    order by c.relname
  loop
    select count(*) into n from pg_policy p where p.polrelid = r.oid;

    if n > 0 then
      execute format('alter table public.%I enable row level security', r.relname);
      enabled := enabled + 1;
      raise notice 'RLS switched on for public.% which already carried % policies', r.relname, n;
    else
      flagged := flagged + 1;
      raise warning 'public.% has RLS off and no policies. Left untouched, because enabling it would deny all access. This one needs a decision.', r.relname;
    end if;
  end loop;

  raise notice 'RLS sweep finished. % tables switched on, % flagged.', enabled, flagged;
end
$$;

-- 3c  Confirm the new objects actually arrived, and fail loudly if not.

do $$
declare
  n integer;
begin
  select count(*) into n
  from pg_class c
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public'
    and c.relkind = 'r'
    and c.relname in ('organizations', 'organization_members', 'projects', 'project_media', 'project_amenities', 'project_buildings', 'project_floors', 'project_units');

  if n <> 8 then
    raise exception 'expected 8 new tables, found %. PART 1 did not complete.', n;
  end if;

  if not exists (
    select 1 from pg_attribute
    where attrelid = 'public.properties'::regclass
      and attname = 'project_id'
      and not attisdropped
  ) then
    raise exception 'properties.project_id is missing. PART 1 did not complete.';
  end if;

  if not exists (
    select 1 from pg_attribute
    where attrelid = 'public.leads'::regclass
      and attname = 'contact_mobile'
      and not attisdropped
  ) then
    raise exception 'leads.contact_mobile is missing. PART 2 did not complete.';
  end if;

  raise notice 'All 8 tables, properties.project_id and leads.contact_mobile are present.';
end
$$;

-- 3d  The audit. This is the result set the Editor will show you.
--
--     Anything with rls_enabled false, or policies 0, is a problem. Rows are
--     ordered so those come first.

select
  c.relname::text                                                      as table_name,
  case when c.relname in ('organizations', 'organization_members', 'projects', 'project_media', 'project_amenities', 'project_buildings', 'project_floors', 'project_units')
       then 'new' else 'existing' end                                  as origin,
  c.relrowsecurity                                                     as rls_enabled,
  c.relforcerowsecurity                                                as rls_forced,
  (select count(*) from pg_policy p where p.polrelid = c.oid)::int      as policies,
  (select count(*) from pg_policy p
    where p.polrelid = c.oid and p.polcmd in ('r', '*'))::int           as select_policies,
  (select count(*) from pg_policy p
    where p.polrelid = c.oid and p.polcmd in ('a', 'w', 'd', '*'))::int as write_policies
from pg_class c
join pg_namespace ns on ns.oid = c.relnamespace
where ns.nspname = 'public'
  and c.relkind = 'r'
order by
  c.relrowsecurity,
  (select count(*) from pg_policy p where p.polrelid = c.oid),
  c.relname;
