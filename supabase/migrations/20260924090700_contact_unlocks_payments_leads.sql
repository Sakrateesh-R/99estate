-- ===========================================================================
-- 99Estate — 008 · Contact unlocks, payments and leads
-- ---------------------------------------------------------------------------
-- The commercial core. Three invariants drive every constraint here:
--
--   Rule 4  exactly 2 free unlocks per user per IST calendar day
--   Rule 6  unlocking the same property twice never charges again
--   Rule 7  an unlock only exists after server-side authorisation/verification
--
-- Consequently there is *no* client INSERT path to any of these tables (see
-- the RLS migration). Rows appear only through SECURITY DEFINER RPCs.
-- ===========================================================================

create table public.contact_unlocks (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  property_id    uuid not null references public.properties (id) on delete cascade,
  -- Denormalised from properties.seller_id: the lead must survive even if the
  -- listing is later reassigned, and it keeps seller-side queries single-table.
  seller_id      uuid not null references public.profiles (id) on delete cascade,
  amount         numeric(10, 2) not null default 0,
  currency       text not null default 'INR',
  is_free        boolean not null,
  payment_id     uuid,
  payment_status public.payment_status not null default 'success',
  unlocked_at    timestamptz not null default now(),
  created_at     timestamptz not null default now(),

  -- A free unlock is always ₹0 and a paid unlock is always > ₹0. Prevents a
  -- "free" row being written with a price, or a paid row being written as ₹0.
  constraint contact_unlocks_amount_matches_kind_check
    check ((is_free and amount = 0) or (not is_free and amount > 0)),
  constraint contact_unlocks_free_is_settled_check
    check (not is_free or payment_status = 'success'),
  constraint contact_unlocks_not_own_listing_check check (user_id <> seller_id),
  constraint contact_unlocks_currency_check check (currency = upper(currency) and char_length(currency) = 3)
);

comment on table public.contact_unlocks is
  'One row per (buyer, property) contact reveal. Written only by SECURITY DEFINER RPCs — never by a client.';

-- Rule 6, enforced by the database: a buyer can hold at most one settled
-- unlock per listing, so a second attempt can never be charged. Partial on
-- `success` so a refunded unlock could legitimately be re-purchased later.
create unique index contact_unlocks_one_settled_per_property_idx
  on public.contact_unlocks (user_id, property_id)
  where payment_status = 'success';

-- Rule 4's daily count: "successful unlocks for this user in this IST window".
create index contact_unlocks_daily_quota_idx
  on public.contact_unlocks (user_id, unlocked_at desc)
  where payment_status = 'success';

create index contact_unlocks_seller_idx on public.contact_unlocks (seller_id, unlocked_at desc);
create index contact_unlocks_property_idx on public.contact_unlocks (property_id, unlocked_at desc);
-- Admin revenue reporting: free vs paid split over time.
create index contact_unlocks_revenue_idx on public.contact_unlocks (is_free, unlocked_at desc);

-- ===========================================================================
-- Payments
-- ===========================================================================

create table public.payments (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles (id) on delete cascade,
  property_id         uuid references public.properties (id) on delete set null,
  contact_unlock_id   uuid,
  -- Authoritative amount, always computed server-side from app_settings.
  amount              numeric(10, 2) not null,
  currency            text not null default 'INR',
  provider            text not null,
  provider_order_id   text,
  provider_payment_id text,
  status              public.payment_status not null default 'created',
  failure_reason      text,
  -- Gateway payloads for reconciliation. Never contains card data.
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint payments_amount_check check (amount >= 0 and amount < 1e7),
  constraint payments_currency_check check (currency = upper(currency) and char_length(currency) = 3),
  constraint payments_provider_check check (char_length(trim(provider)) between 2 and 40)
);

comment on table public.payments is
  'Gateway transaction ledger. `status` only reaches success through a signature-verified webhook.';

-- Idempotency keys for the webhook: replaying the same gateway event must not
-- create a second payment row or a second unlock.
create unique index payments_provider_order_idx
  on public.payments (provider, provider_order_id) where provider_order_id is not null;
create unique index payments_provider_payment_idx
  on public.payments (provider, provider_payment_id) where provider_payment_id is not null;

create index payments_user_idx on public.payments (user_id, created_at desc);
create index payments_status_idx on public.payments (status, created_at desc);
create index payments_property_idx on public.payments (property_id);

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

-- The two tables reference each other, so the foreign keys are added after
-- both exist. Both sides are nullable, so there is no chicken-and-egg insert.
alter table public.contact_unlocks
  add constraint contact_unlocks_payment_id_fkey
  foreign key (payment_id) references public.payments (id) on delete set null;

alter table public.payments
  add constraint payments_contact_unlock_id_fkey
  foreign key (contact_unlock_id) references public.contact_unlocks (id) on delete set null;

-- A paid unlock must point at the payment that settled it.
alter table public.contact_unlocks
  add constraint contact_unlocks_paid_needs_payment_check
  check (is_free or payment_id is not null) not valid;
alter table public.contact_unlocks validate constraint contact_unlocks_paid_needs_payment_check;

-- ===========================================================================
-- Leads (Rule 9: every successful unlock creates one)
-- ===========================================================================

create table public.leads (
  id                    uuid primary key default gen_random_uuid(),
  property_id           uuid not null references public.properties (id) on delete cascade,
  seller_id             uuid not null references public.profiles (id) on delete cascade,
  buyer_id              uuid not null references public.profiles (id) on delete cascade,
  -- 1:1 with the unlock that produced it — the unique constraint is what makes
  -- lead creation idempotent under webhook replay.
  contact_unlock_id     uuid not null unique references public.contact_unlocks (id) on delete cascade,
  status                public.lead_status not null default 'new',
  notes                 text,
  last_status_change_at timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint leads_notes_check check (notes is null or char_length(notes) <= 2000),
  constraint leads_not_self_check check (buyer_id <> seller_id)
);

create index leads_seller_idx on public.leads (seller_id, created_at desc);
create index leads_seller_status_idx on public.leads (seller_id, status, created_at desc);
create index leads_buyer_idx on public.leads (buyer_id, created_at desc);
create index leads_property_idx on public.leads (property_id, created_at desc);

create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

-- A seller owns the pipeline state of their lead and nothing else about it.
-- SECURITY INVOKER on purpose — see is_trusted_writer(). This is what makes
-- "leads are created automatically" enforceable: request_contact_unlock() is a
-- definer routine so its INSERT passes, a direct client INSERT does not.
create or replace function public.leads_guard_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_trusted_writer() or public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'leads are created automatically by a contact unlock' using errcode = '42501';
  end if;

  if auth.uid() is distinct from old.seller_id then
    raise exception 'only the listing owner can update this lead' using errcode = '42501';
  end if;

  if new.property_id       is distinct from old.property_id
     or new.seller_id      is distinct from old.seller_id
     or new.buyer_id       is distinct from old.buyer_id
     or new.contact_unlock_id is distinct from old.contact_unlock_id
     or new.created_at     is distinct from old.created_at then
    raise exception 'only status and notes can be updated on a lead' using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    new.last_status_change_at := now();
  end if;

  return new;
end;
$$;

create trigger leads_guard_write_trg
  before insert or update on public.leads
  for each row execute function public.leads_guard_write();

-- ---------------------------------------------------------------------------
-- Dashboard counters
-- ---------------------------------------------------------------------------
create or replace function public.contact_unlocks_sync_counter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.properties set unlocks_count = unlocks_count + 1 where id = new.property_id;
  elsif tg_op = 'DELETE' then
    update public.properties set unlocks_count = greatest(0, unlocks_count - 1) where id = old.property_id;
  end if;
  return null;
end;
$$;

create trigger contact_unlocks_sync_counter_trg
  after insert or delete on public.contact_unlocks
  for each row execute function public.contact_unlocks_sync_counter();

create or replace function public.leads_sync_counter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.properties set leads_count = leads_count + 1 where id = new.property_id;
  elsif tg_op = 'DELETE' then
    update public.properties set leads_count = greatest(0, leads_count - 1) where id = old.property_id;
  end if;
  return null;
end;
$$;

create trigger leads_sync_counter_trg
  after insert or delete on public.leads
  for each row execute function public.leads_sync_counter();
