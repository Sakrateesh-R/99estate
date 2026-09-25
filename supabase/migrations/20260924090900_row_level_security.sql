-- ===========================================================================
-- 99Estate — 010 · Row Level Security
-- ---------------------------------------------------------------------------
-- Supabase grants anon/authenticated broad table privileges by default, so RLS
-- is the real access control layer. The shape of this file is deliberate:
--
--   * Tables a user owns          → self-service policies keyed on auth.uid()
--   * Tables that represent money → SELECT only; every write goes through a
--                                   SECURITY DEFINER RPC (Rules 5, 6, 7)
--   * Private columns across users→ exposed through curated views, never by
--                                   loosening a row policy (Rule 8)
--
-- A table with RLS enabled and no policy for a command denies that command.
-- That "deny by omission" is how contact_unlocks, payments and leads stay
-- un-forgeable from the browser.
-- ===========================================================================

alter table public.profiles              enable row level security;
alter table public.properties            enable row level security;
alter table public.property_images       enable row level security;
alter table public.property_amenities    enable row level security;
alter table public.saved_properties      enable row level security;
alter table public.property_views        enable row level security;
alter table public.contact_unlocks       enable row level security;
alter table public.payments              enable row level security;
alter table public.leads                 enable row level security;
alter table public.property_reports      enable row level security;
alter table public.notifications         enable row level security;
alter table public.app_settings          enable row level security;
alter table public.locations             enable row level security;
alter table public.property_categories   enable row level security;
alter table public.amenities             enable row level security;
alter table public.verification_requests enable row level security;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
-- Only ever your own row. Other people's names/avatars come from the
-- seller_public_profiles view, which has no contact columns to leak.
create policy profiles_select_self on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

create policy profiles_insert_self on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- properties
-- ---------------------------------------------------------------------------
-- Rule 2/3: browsing is free and anonymous. Expired listings drop out of the
-- public result set here (§18) rather than in every query.
create policy properties_select_published on public.properties
  for select to anon, authenticated
  using (status = 'published' and (expires_at is null or expires_at > now()));

create policy properties_select_own on public.properties
  for select to authenticated
  using (seller_id = auth.uid() or public.is_admin());

-- §2: a mobile number is mandatory before posting. The generated
-- is_profile_complete column behind profile_is_complete() cannot be spoofed.
create policy properties_insert_own on public.properties
  for insert to authenticated
  with check (seller_id = auth.uid() and public.profile_is_complete());

create policy properties_update_own on public.properties
  for update to authenticated
  using (seller_id = auth.uid() or public.is_admin())
  with check (seller_id = auth.uid() or public.is_admin());

create policy properties_delete_own on public.properties
  for delete to authenticated
  using (seller_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- property_images / property_amenities
-- ---------------------------------------------------------------------------
-- Visibility follows the parent listing; writes follow ownership.
create policy property_images_select on public.property_images
  for select to anon, authenticated
  using (public.can_view_property(property_id));

create policy property_images_write on public.property_images
  for all to authenticated
  using (public.owns_property(property_id) or public.is_admin())
  with check (public.owns_property(property_id) or public.is_admin());

create policy property_amenities_select on public.property_amenities
  for select to anon, authenticated
  using (public.can_view_property(property_id));

create policy property_amenities_write on public.property_amenities
  for all to authenticated
  using (public.owns_property(property_id) or public.is_admin())
  with check (public.owns_property(property_id) or public.is_admin());

-- ---------------------------------------------------------------------------
-- saved_properties (§14)
-- ---------------------------------------------------------------------------
create policy saved_properties_own on public.saved_properties
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.property_is_live(property_id));

-- ---------------------------------------------------------------------------
-- property_views — analytics for the listing owner. No INSERT policy: rows
-- arrive exclusively through record_property_view().
-- ---------------------------------------------------------------------------
create policy property_views_select_owner on public.property_views
  for select to authenticated
  using (public.owns_property(property_id) or public.is_admin());

-- ---------------------------------------------------------------------------
-- contact_unlocks — SELECT ONLY.
-- ---------------------------------------------------------------------------
-- Deliberately no INSERT/UPDATE/DELETE policy. This is what makes "Fake
-- contact unlocks" and "Give themselves free unlocks" (§24) impossible: the
-- only writer is request_contact_unlock() / settle_paid_contact_unlock(),
-- both SECURITY DEFINER and both re-deriving the price server-side.
create policy contact_unlocks_select_participants on public.contact_unlocks
  for select to authenticated
  using (user_id = auth.uid() or seller_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- payments — SELECT ONLY, same reasoning (§24 "Modify payment records").
-- ---------------------------------------------------------------------------
create policy payments_select_own on public.payments
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- leads — sellers own the pipeline; buyers can see the leads they generated.
-- No INSERT policy: leads are a side effect of an unlock (Rule 9).
-- ---------------------------------------------------------------------------
create policy leads_select_participants on public.leads
  for select to authenticated
  using (seller_id = auth.uid() or buyer_id = auth.uid() or public.is_admin());

create policy leads_update_seller on public.leads
  for update to authenticated
  using (seller_id = auth.uid() or public.is_admin())
  with check (seller_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- property_reports (§17)
-- ---------------------------------------------------------------------------
create policy property_reports_insert_self on public.property_reports
  for insert to authenticated
  with check (reporter_id = auth.uid());

create policy property_reports_select_own on public.property_reports
  for select to authenticated
  using (reporter_id = auth.uid() or public.is_admin());

create policy property_reports_update_admin on public.property_reports
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- notifications — read + mark-as-read + dismiss. Creation is server-side only.
-- ---------------------------------------------------------------------------
create policy notifications_select_own on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy notifications_delete_own on public.notifications
  for delete to authenticated
  using (user_id = auth.uid());

-- Marking as read is the only field a recipient may change; they must not be
-- able to rewrite the text of a notification they were sent.
-- SECURITY INVOKER on purpose — see is_trusted_writer().
create or replace function public.notifications_guard_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_trusted_writer() or public.is_admin() then
    return new;
  end if;
  new.user_id    := old.user_id;
  new.title      := old.title;
  new.message    := old.message;
  new.type       := old.type;
  new.link       := old.link;
  new.data       := old.data;
  new.created_at := old.created_at;
  return new;
end;
$$;

create trigger notifications_guard_write_trg
  before update on public.notifications
  for each row execute function public.notifications_guard_write();

-- ---------------------------------------------------------------------------
-- app_settings — public constants are readable (the ₹9 price is marketing
-- copy); everything else, and every write, is admin-only.
-- ---------------------------------------------------------------------------
create policy app_settings_select_public on public.app_settings
  for select to anon, authenticated
  using (is_public or public.is_admin());

create policy app_settings_write_admin on public.app_settings
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Catalogue tables — public read of active rows, admin write.
-- ---------------------------------------------------------------------------
create policy locations_select_active on public.locations
  for select to anon, authenticated using (is_active or public.is_admin());
create policy locations_write_admin on public.locations
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy property_categories_select_active on public.property_categories
  for select to anon, authenticated using (is_active or public.is_admin());
create policy property_categories_write_admin on public.property_categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy amenities_select_active on public.amenities
  for select to anon, authenticated using (is_active or public.is_admin());
create policy amenities_write_admin on public.amenities
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- verification_requests
-- ---------------------------------------------------------------------------
create policy verification_requests_select_own on public.verification_requests
  for select to authenticated
  using (seller_id = auth.uid() or public.is_admin());

create policy verification_requests_insert_own on public.verification_requests
  for insert to authenticated
  with check (public.owns_property(property_id));

create policy verification_requests_update_admin on public.verification_requests
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ===========================================================================
-- Curated cross-user projections
-- ---------------------------------------------------------------------------
-- Two places legitimately need a phone number that belongs to someone else.
-- Rather than widening the profiles policy (which would leak every number to
-- everyone), each case gets a view that hard-codes the authorisation test in
-- its WHERE clause and exposes only the columns that case needs.
-- ===========================================================================

-- (a) Buyer → seller, but only for listings the buyer has actually unlocked.
create view public.unlocked_seller_contacts
with (security_invoker = false) as
select
  cu.id          as contact_unlock_id,
  cu.property_id,
  cu.user_id     as buyer_id,
  cu.seller_id,
  cu.is_free,
  cu.amount,
  cu.currency,
  cu.unlocked_at,
  s.full_name    as seller_name,
  s.mobile_number as seller_mobile,
  s.avatar_url   as seller_avatar,
  s.role         as seller_type
from public.contact_unlocks cu
join public.profiles s on s.id = cu.seller_id
where cu.payment_status = 'success'
  and (cu.user_id = auth.uid() or public.is_admin());

comment on view public.unlocked_seller_contacts is
  'Reveals a seller phone number to exactly one audience: the buyer who holds a settled unlock for that listing.';

revoke all on public.unlocked_seller_contacts from public, anon, authenticated;
grant select on public.unlocked_seller_contacts to authenticated;

-- (b) Seller → buyer, for the leads the seller earned (§15).
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
  b.full_name     as buyer_name,
  b.mobile_number as buyer_mobile,
  b.avatar_url    as buyer_avatar,
  p.title         as property_title,
  p.slug          as property_slug,
  p.city          as property_city,
  p.locality      as property_locality,
  p.price         as property_price,
  p.listing_type,
  cu.is_free      as unlock_was_free,
  cu.amount       as unlock_amount,
  cu.unlocked_at
from public.leads l
join public.profiles b        on b.id = l.buyer_id
join public.properties p      on p.id = l.property_id
join public.contact_unlocks cu on cu.id = l.contact_unlock_id
where l.seller_id = auth.uid() or public.is_admin();

comment on view public.lead_details is
  'Lead inbox for the listing owner, including the buyer contact they earned. Filtered to auth.uid() inside the view.';

revoke all on public.lead_details from public, anon, authenticated;
grant select on public.lead_details to authenticated;
