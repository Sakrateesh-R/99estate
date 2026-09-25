-- ===========================================================================
-- 99Estate — 006 · Saved properties and view tracking
-- ---------------------------------------------------------------------------
-- Both feed the seller dashboard counters. Views are de-duplicated per
-- visitor per IST day so the number means "people", not "page loads".
-- ===========================================================================

create table public.saved_properties (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  created_at  timestamptz not null default now(),

  -- §14: prevent duplicate saves.
  constraint saved_properties_unique unique (user_id, property_id)
);

create index saved_properties_user_idx on public.saved_properties (user_id, created_at desc);
create index saved_properties_property_idx on public.saved_properties (property_id);

-- ===========================================================================
-- Views
-- ===========================================================================

create table public.property_views (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references public.properties (id) on delete cascade,
  -- Null for signed-out visitors; they are identified by visitor_hash only.
  viewer_id    uuid references public.profiles (id) on delete set null,
  -- Salted hash of (ip + user agent). Deliberately not reversible — we only
  -- need it to collapse repeat views, never to identify a person.
  visitor_hash text not null,
  viewed_on    date not null default (now() at time zone 'Asia/Kolkata')::date,
  created_at   timestamptz not null default now()
);

comment on table public.property_views is
  'One row per unique visitor per listing per IST day. Written only through record_property_view().';

create unique index property_views_dedupe_idx
  on public.property_views (property_id, visitor_hash, viewed_on);
create index property_views_property_idx on public.property_views (property_id, viewed_on desc);
create index property_views_viewer_idx on public.property_views (viewer_id, created_at desc);

-- --------------------------------------------------------------------------
-- Counter maintenance
-- --------------------------------------------------------------------------
create or replace function public.saved_properties_sync_counter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.properties set saves_count = saves_count + 1 where id = new.property_id;
  else
    update public.properties set saves_count = greatest(0, saves_count - 1) where id = old.property_id;
  end if;
  return null;
end;
$$;

create trigger saved_properties_sync_counter_trg
  after insert or delete on public.saved_properties
  for each row execute function public.saved_properties_sync_counter();

create or replace function public.property_views_sync_counter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.properties set views_count = views_count + 1 where id = new.property_id;
  return null;
end;
$$;

create trigger property_views_sync_counter_trg
  after insert on public.property_views
  for each row execute function public.property_views_sync_counter();

-- --------------------------------------------------------------------------
-- The only sanctioned way to record a view. There is no INSERT policy on
-- property_views, so a client cannot inflate a competitor's — or its own —
-- view count by posting rows directly.
-- --------------------------------------------------------------------------
create or replace function public.record_property_view(
  p_property_id  uuid,
  p_visitor_hash text
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if p_property_id is null or coalesce(trim(p_visitor_hash), '') = '' then
    return;
  end if;

  -- Only live listings accrue views, and a seller viewing their own listing
  -- does not count.
  if not public.property_is_live(p_property_id) then
    return;
  end if;
  if public.owns_property(p_property_id) then
    return;
  end if;

  insert into public.property_views (property_id, viewer_id, visitor_hash)
  values (p_property_id, auth.uid(), left(p_visitor_hash, 128))
  on conflict (property_id, visitor_hash, viewed_on) do nothing;
end;
$$;

revoke all on function public.record_property_view(uuid, text) from public;
grant execute on function public.record_property_view(uuid, text) to anon, authenticated;
