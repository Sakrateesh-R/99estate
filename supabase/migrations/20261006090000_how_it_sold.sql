-- ===========================================================================
-- 99Estate — 028 · How a listing closed
-- ---------------------------------------------------------------------------
-- A listing can already be marked sold or rented. What it could not record is
-- the one thing worth knowing: whether the buyer came from here.
--
-- Two unlocks and two leads are the only evidence the marketplace works, and
-- neither tells you whether a deal followed. A seller marking a plot sold is
-- the single moment they know the answer and are willing to say — ask then or
-- never.
--
-- Self-reported and optional on purpose. A seller who sold through a broker may
-- not want to say so, and a mandatory question would be answered carelessly or
-- would stop them marking it sold at all — which costs a stale listing on the
-- site, a worse trade than a missing data point.
--
-- Re-runnable: applied by pasting into the Supabase SQL Editor.
-- ===========================================================================

alter table public.properties
  add column if not exists sold_via text;

alter table public.properties
  add column if not exists closed_at timestamptz;

comment on column public.properties.sold_via is
  'Self-reported: where the buyer or tenant came from, recorded when the seller marks the listing sold or rented. NULL means not answered, which is always allowed.';

comment on column public.properties.closed_at is
  'When the listing was marked sold or rented. Distinct from updated_at, which moves for any edit.';

alter table public.properties
  drop constraint if exists properties_sold_via_check;

alter table public.properties
  add constraint properties_sold_via_check check (
    sold_via is null
    or sold_via in ('99estate', 'other_platform', 'offline', 'not_said')
  );

/**
 * Stamps `closed_at` when a listing closes, and clears it if it reopens.
 *
 * In the trigger rather than the action because the action is one of several
 * paths that can change status — an admin take-down and a renewal both move it
 * too — and a timestamp that depends on which code path ran is not a timestamp
 * anyone can trust.
 */
create or replace function public.properties_stamp_closed_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status in ('sold', 'rented') and old.status not in ('sold', 'rented') then
    new.closed_at := now();
  elsif new.status not in ('sold', 'rented') and old.status in ('sold', 'rented') then
    -- Reopened: the old answer describes a sale that evidently did not stick.
    new.closed_at := null;
    new.sold_via  := null;
  end if;

  return new;
end;
$$;

drop trigger if exists properties_stamp_closed_at on public.properties;

create trigger properties_stamp_closed_at
  before update of status on public.properties
  for each row execute function public.properties_stamp_closed_at();

-- Reading the answer back: how many closed, and where the buyer came from.
create index if not exists properties_closed_idx
  on public.properties (closed_at desc)
  where closed_at is not null;
