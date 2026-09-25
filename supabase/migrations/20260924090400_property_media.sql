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
