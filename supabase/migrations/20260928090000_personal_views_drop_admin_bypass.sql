-- ===========================================================================
-- 019 — the two personal views stop making an exception for admins.
-- ---------------------------------------------------------------------------
-- `unlocked_seller_contacts` carried `or public.is_admin()`, which meant an
-- admin reading it got every buyer's purchased contact, not their own. Its own
-- comment says the opposite — "exactly one audience: the buyer who holds a
-- settled unlock for that listing" — so the comment was the specification and
-- the WHERE clause disagreed with it.
--
-- That mattered because five call sites read these views filtered only by
-- property, trusting the view to answer "and is it yours?". They are correct
-- for every ordinary user and wrong for an admin: an admin saw a seller's
-- number on listing cards, on unlocked addresses, and on the dashboard page
-- that lists the contacts you have unlocked. Fixing the callers one by one
-- would leave the next one to be written exposed, so the fix belongs here.
--
-- An admin who needs a system-wide view has the admin console, which reads the
-- base tables directly and says so. Nothing there reads either view.
--
-- `lead_details` keeps a narrower exception, because removing it outright would
-- strand real work: a listing an admin entered on behalf of a walk-in owner has
-- that owner as its seller, and most of those owners are placeholder accounts
-- that cannot sign in at all. Without this, a lead on such a listing would be
-- visible to nobody. So the test becomes "did you post it", not "are you an
-- admin" — the same rule the dashboard now uses to decide which listings are
-- yours to manage.
-- ===========================================================================

create or replace view public.unlocked_seller_contacts
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
  and cu.user_id = auth.uid();

comment on view public.unlocked_seller_contacts is
  'Reveals a seller phone number to exactly one audience: the buyer who holds a settled unlock for that listing. No admin exception — a purchased contact is nobody else''s business.';

create or replace view public.lead_details
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
where l.seller_id = auth.uid()
   or p.posted_by = auth.uid();

comment on view public.lead_details is
  'Lead inbox for the person responsible for the listing: its owner, or the admin who posted it on their behalf when the owner is a placeholder account that cannot sign in. Filtered to auth.uid() inside the view.';
