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
