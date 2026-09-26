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
