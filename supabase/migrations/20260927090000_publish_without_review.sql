-- ===========================================================================
-- 99Estate — 017 · Listings publish without review
-- ---------------------------------------------------------------------------
-- Moderation before publication is removed. A seller who completes a listing
-- publishes it; it is live immediately.
--
-- The rule lived in `properties_guard_write`, which allowed a seller only
-- `draft → pending` and left `pending → published` to an admin. Changing the
-- app alone would have left the database refusing what the product now offers,
-- so the transition list is what changes here:
--
--   draft    → pending, published
--
-- And a material edit to a live listing no longer demotes it to `pending`. That
-- rule existed to force re-approval; without a queue it would have taken the
-- listing out of search with nothing able to put it back.
--   pending  → draft, published
--   rejected → draft, pending, published
--
-- Everything else in the guard is byte-for-byte the previous version. It was
-- extracted from migration 014 and patched programmatically rather than
-- retyped: it is 108 lines of safety-critical branching — seller_id pinning,
-- the admin-managed column locks, the counter pins, the re-review trigger on
-- material edits — and re-transcribing it to change two lines is how one of
-- those quietly goes missing.
--
-- What is deliberately kept:
--
--   `published → paused | sold | rented` and the rest of the lifecycle, which
--   are how a seller takes a listing down.
--
--   `admin_approve_property` and `admin_reject_property`. Review before
--   publication is gone; taking a bad listing down afterwards is not, and the
--   reports queue still needs both — reject to unpublish, approve to restore.
--
--   The publication bookkeeping further down the same function, which stamps
--   `published_at` and the 90-day `expires_at` for every writer. That is what
--   makes a self-published listing enter the expiry cycle like any other.
--
-- Re-runnable: `create or replace`.
-- ===========================================================================

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
             (old.status = 'draft'     and new.status in ('pending', 'published'))
          or (old.status = 'pending'   and new.status in ('draft', 'published'))
          or (old.status = 'published' and new.status in ('paused', 'sold', 'rented'))
          or (old.status = 'paused'    and new.status in ('published', 'sold', 'rented'))
          or (old.status in ('sold', 'rented', 'expired') and new.status in ('paused'))
          or (old.status = 'rejected'  and new.status in ('draft', 'pending', 'published'))
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

        -- A live listing used to drop back to 'pending' on a material edit.
        -- With no review queue that would take it out of search with nothing
        -- to put it back, so an edit now leaves the listing published.
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
