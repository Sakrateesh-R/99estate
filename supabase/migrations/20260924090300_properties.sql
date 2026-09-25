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
