-- ===========================================================================
-- 99Estate — 030 · One lead inbox, covering projects and units too
-- ---------------------------------------------------------------------------
-- §29: every project and property enquiry becomes a lead. The `leads` table
-- already existed, but it was shaped around exactly one way of producing a
-- lead — a settled ₹9 contact unlock:
--
--   contact_unlock_id  uuid NOT NULL UNIQUE references contact_unlocks
--   property_id        uuid NOT NULL
--   seller_id          uuid NOT NULL
--
-- A buyer asking a builder about unit A101 has no unlock, no listing row and
-- no single seller — the counterparty is an organization. So all three
-- columns become nullable and the table gains the project side of the
-- relationship.
--
-- What deliberately does NOT change, because it is where the money lives:
--
--   * The UNIQUE on `contact_unlock_id` stays. PostgreSQL treats NULLs as
--     distinct, so unlock-driven leads keep their 1:1 idempotency under
--     webhook replay while project leads sit alongside them as NULLs.
--   * Rule 4 (two free unlocks per IST day), Rule 6 (never charged twice) and
--     Rule 7 (no unlock without server-side authorisation) are all enforced in
--     `contact_unlocks`, not here. Nothing below touches them.
--   * `leads_guard_write`'s INSERT branch still refuses every client INSERT.
--     Project enquiries arrive through submit_project_enquiry(), which is
--     SECURITY DEFINER and therefore a trusted writer — so "leads are created
--     automatically" remains true rather than becoming a convention.
--
-- And the one privacy rule that shapes the whole design: Rule 8 says a phone
-- number is revealed only through a settled unlock. A project enquiry
-- therefore carries the name and number the *buyer typed into the enquiry
-- form*, stored on the lead row. `profiles.mobile_number` is never read
-- across users for a project lead, and the rebuilt `lead_details` view below
-- is explicit about which of the two a given row exposes.
--
-- Re-runnable: applied by pasting into the Supabase SQL Editor.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1 · Where a lead came from
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.lead_source as enum (
    'contact_unlock',   -- a buyer unlocked a seller's number (the original path)
    'project_enquiry',  -- "Contact builder" on a project page
    'unit_enquiry',     -- "Interested in A101" — §29's worked example
    'site_visit',       -- a site-visit request, which Phase 3 will raise
    'admin'             -- entered by an admin on somebody's behalf
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 2 · Columns
-- ---------------------------------------------------------------------------
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

-- `unit_id` referencing project_units means this migration has to run after
-- 029. Stated as a comment rather than enforced, because the timestamp
-- ordering already does it and a paste in the wrong order fails loudly on the
-- missing table.

alter table public.leads alter column contact_unlock_id drop not null;
alter table public.leads alter column property_id       drop not null;
alter table public.leads alter column seller_id         drop not null;

-- ---------------------------------------------------------------------------
-- 3 · Integrity
-- ---------------------------------------------------------------------------
-- Dropping three NOT NULLs removes three guarantees, so each is replaced by a
-- rule about the shape of a whole row rather than one column.

-- A lead has to be about something.
alter table public.leads drop constraint if exists leads_has_a_target_check;
alter table public.leads
  add constraint leads_has_a_target_check
  check (property_id is not null or project_id is not null);

-- An unlock-driven lead is exactly the rows with an unlock behind them, and
-- those are exactly the rows with a listing and a seller. This is what stops a
-- project lead being mislabelled as a paid one — which would make it look, in
-- the admin revenue reports, as though ₹9 had changed hands.
alter table public.leads drop constraint if exists leads_unlock_source_check;
alter table public.leads
  add constraint leads_unlock_source_check
  check (
    (source = 'contact_unlock' and contact_unlock_id is not null
       and property_id is not null and seller_id is not null)
    or (source <> 'contact_unlock' and contact_unlock_id is null)
  );

-- Everything that is not an unlock belongs to an organization, because that is
-- who answers it.
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

-- Same bare-10-digit shape as profiles.mobile_number, so the two render
-- identically as +91 XXXXX XXXXX.
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

-- One enquiry per buyer per thing enquired about.
--
-- Without this, "Send enquiry" pressed three times is three leads and the
-- builder's inbox is noise. `coalesce` on `unit_id` is what makes it bite: a
-- plain UNIQUE would treat every project-level enquiry (unit_id NULL) as
-- distinct from every other, since NULLs do not collide.
create unique index if not exists leads_one_enquiry_per_target_idx
  on public.leads (buyer_id, project_id, coalesce(unit_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where project_id is not null;

-- ---------------------------------------------------------------------------
-- 4 · Counters
-- ---------------------------------------------------------------------------
-- The original incremented properties.leads_count unconditionally. With a
-- nullable property_id that UPDATE now matches no rows for a project lead,
-- which is harmless — but the project's own counter would never move. Both
-- sides are handled here.
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

-- ---------------------------------------------------------------------------
-- 5 · Write guard
-- ---------------------------------------------------------------------------
-- The INSERT branch is unchanged in effect: still no client-created leads.
-- The UPDATE branch is what has to grow, because `auth.uid() = old.seller_id`
-- is not an answer for a lead whose counterparty is a company — seller_id is
-- NULL on those, and `auth.uid() is distinct from null` is true, so the old
-- guard would have rejected every project lead update.
--
-- SECURITY INVOKER on purpose — see is_trusted_writer(). That is what makes
-- "leads are created automatically" enforceable: submit_project_enquiry() and
-- request_contact_unlock() are definer routines so their INSERTs pass, and a
-- direct request from `authenticated` does not.
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

  -- Who owns the pipeline state of this lead:
  --   an individual listing  → its seller, exactly as before
  --   a project enquiry      → owner / admin / sales manager of the company,
  --                            or the executive it is assigned to (§3)
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
     -- The buyer's own words and number. A builder must not be able to edit
     -- the contact details they were given and then dispute what was sent.
     or new.contact_name   is distinct from old.contact_name
     or new.contact_mobile is distinct from old.contact_mobile
     or new.message        is distinct from old.message
     or new.created_at     is distinct from old.created_at then
    raise exception 'only status, notes and assignment can be updated on a lead'
      using errcode = '42501';
  end if;

  -- A sales executive may work the lead they hold but not hand it to someone
  -- else; reassignment is a manager's call.
  if new.assigned_to is distinct from old.assigned_to then
    if not (
         (old.seller_id is not null and auth.uid() = old.seller_id)
      or (old.organization_id is not null and public.can_manage_org_inventory(old.organization_id))
    ) then
      raise exception 'only a manager can reassign a lead' using errcode = '42501';
    end if;
    -- And only to somebody who actually works there.
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

-- ---------------------------------------------------------------------------
-- 6 · Row Level Security
-- ---------------------------------------------------------------------------
-- The organization is a third kind of participant, and a sales executive sees
-- the leads assigned to them (§3) — which the org-member clause already
-- covers, but stating it separately is what lets a VIEWER-turned-executive
-- keep their own pipeline if the role is narrowed later.
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

-- ---------------------------------------------------------------------------
-- 7 · The lead inbox
-- ---------------------------------------------------------------------------
-- Dropped and rebuilt rather than replaced: the joins change from INNER to
-- LEFT, and `create or replace view` is not the tool for restructuring a FROM
-- clause.
--
-- Every INNER JOIN in the original was a filter nobody intended. A project
-- lead has no row in `properties` and none in `contact_unlocks`, so under the
-- old definition it would have been silently dropped from the very inbox it
-- was created for.
--
-- `security_invoker = false` is what lets this view read a phone number its
-- caller could not select directly. That is safe only because the WHERE clause
-- hard-codes the authorisation test and the column list is curated — so the
-- CASE on buyer_mobile is load-bearing, not cosmetic.
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

  -- Rule 8, in one expression.
  --
  -- With an unlock behind the lead, the buyer paid (or spent a free credit) to
  -- reveal the *seller's* number and the seller gets theirs in return — that
  -- is the existing bargain and `profiles.mobile_number` is the right source.
  -- Without one, the only number anybody is entitled to is the one the buyer
  -- typed into the enquiry form. Never both, and never the profile number by
  -- default.
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

-- ---------------------------------------------------------------------------
-- 8 · Raising a project enquiry (§29, §30)
-- ---------------------------------------------------------------------------
-- A SECURITY DEFINER RPC rather than an INSERT policy, for three reasons that
-- an RLS policy cannot cover on its own: the lead has to be stamped with the
-- organization that owns the project (which the client must not get to choose),
-- the builder has to be notified, and pressing the button twice must not
-- produce two leads.
--
-- Requires a session. An anonymous enquiry would mean a lead with no
-- `buyer_id`, and `leads.buyer_id` is NOT NULL — which is a constraint worth
-- keeping, because an unauthenticated enquiry form is a spam endpoint.
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

  -- +91 and 0 prefixes are what people actually type.
  if char_length(v_mobile) > 10 then
    v_mobile := right(v_mobile, 10);
  end if;
  if v_mobile !~ '^[6-9][0-9]{9}$' then
    return jsonb_build_object('ok', false, 'code', 'mobile_invalid');
  end if;
  if v_name is null or char_length(v_name) < 2 then
    return jsonb_build_object('ok', false, 'code', 'name_required');
  end if;

  -- Resolved here, not accepted from the caller: this is what stops an
  -- enquiry being filed against somebody else's company.
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

  -- A member enquiring about their own project would put a lead in their own
  -- inbox. Mirrors contact_unlocks_not_own_listing_check.
  if public.is_org_member(v_project.organization_id, v_uid) then
    return jsonb_build_object('ok', false, 'code', 'own_project');
  end if;

  -- Pressing the button again updates the enquiry instead of duplicating it,
  -- and deliberately does not reopen a lead the builder has already worked:
  -- `status` is theirs, not the buyer's.
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
    -- An empty box on a repeat enquiry must not wipe what was said the first
    -- time. `leads` unqualified is the pre-existing row, which is the only
    -- spelling ON CONFLICT accepts here.
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
