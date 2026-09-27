-- ===========================================================================
-- 99Estate — 018 · A first publication is not a resume
-- ---------------------------------------------------------------------------
-- Fixes migration 017, which was incomplete. It opened the status transition
-- list so a seller could go draft -> published, and stopped there. The guard
-- has a second gate further down, and that one rejected every new listing with
-- "listing has not been approved yet" — which is what sellers hit on the live
-- site the moment 017 was applied.
--
-- That gate was written for resuming a paused listing: it requires
-- `published_at` to be set and the 90-day window to still be open. Sound while
-- an admin was the only one who could publish, because by then the listing had
-- always been live once. A first publication has no `published_at` by
-- definition, so once sellers published directly it refused all of them.
--
-- It is now scoped to `old.status = 'paused'`, the case it was written for.
-- Resuming still requires a listing that was live and has not expired;
-- publishing for the first time no longer has to pretend it was.
--
-- Everything else is byte-identical to 017 — extracted and patched
-- programmatically rather than retyped.
--
-- Re-runnable: create or replace.
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

        -- Resuming a paused listing only works if it was live once and the
        -- 90-day window has not run out; otherwise it must be renewed.
        --
        -- Scoped to resumes. It used to fire on every transition into
        -- 'published', which was harmless while only an admin could make one:
        -- a first publication has no published_at yet by definition, so once
        -- sellers published directly this rejected every new listing with
        -- "listing has not been approved yet".
        if new.status = 'published' and old.status = 'paused' then
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
