-- ===========================================================================
-- 99Estate — 001 · Extensions and domain enums
-- ---------------------------------------------------------------------------
-- Every enum used across the schema lives here so downstream migrations can
-- rely on them existing. Enums (rather than free text + CHECK) give us
-- database-level guarantees plus generated TypeScript union types.
-- ===========================================================================

-- gen_random_uuid() is core since PostgreSQL 13, so pgcrypto is not required
-- for primary keys. pg_trgm powers the fuzzy city/locality matching used by
-- search autocomplete. Supabase keeps extensions in the `extensions` schema,
-- which is why the trigram operator classes are qualified as such below.
create extension if not exists "pg_trgm" with schema extensions;

-- --------------------------------------------------------------------------
-- Identity
-- --------------------------------------------------------------------------

-- Everyone starts as `buyer`. Posting a property promotes them to `owner`.
-- `agent` / `builder` arrive via their own onboarding. `admin` is granted
-- out-of-band only (see profiles_guard_write trigger).
create type public.user_role as enum ('buyer', 'owner', 'agent', 'builder', 'admin');

create type public.account_status as enum ('active', 'suspended');

-- --------------------------------------------------------------------------
-- Property taxonomy
-- --------------------------------------------------------------------------

create type public.property_type as enum (
  -- residential
  'apartment',
  'independent_house',
  'villa',
  'builder_floor',
  'penthouse',
  'studio',
  'farmhouse',
  'residential_plot',
  -- commercial
  'office_space',
  'co_working',
  'shop',
  'showroom',
  'warehouse',
  'industrial_land',
  'commercial_plot',
  -- other
  'pg_hostel',
  'agricultural_land'
);

create type public.listing_type as enum ('sale', 'rent', 'pg');

create type public.area_unit as enum (
  'sqft', 'sqm', 'sqyd', 'acre', 'hectare', 'cent', 'guntha', 'bigha', 'marla', 'kanal'
);

create type public.furnishing_status as enum ('unfurnished', 'semi_furnished', 'fully_furnished');

create type public.facing_direction as enum (
  'north', 'south', 'east', 'west', 'north_east', 'north_west', 'south_east', 'south_west'
);

-- draft     → seller is still editing
-- pending   → submitted, waiting on admin moderation
-- published → live and searchable
-- paused    → temporarily hidden by the seller
-- sold/rented → closed by the seller, no longer an active listing
-- expired   → passed expires_at (90 days by default)
-- rejected  → moderation declined it
create type public.property_status as enum (
  'draft', 'pending', 'published', 'paused', 'sold', 'rented', 'expired', 'rejected'
);

create type public.verification_status as enum ('unverified', 'pending', 'verified', 'rejected');

-- --------------------------------------------------------------------------
-- Money & leads
-- --------------------------------------------------------------------------

-- `created` → order opened with the gateway, nothing charged yet.
-- `pending` → gateway is processing / awaiting authorisation.
-- `success` → verified server-side (webhook), the only state that unlocks.
create type public.payment_status as enum ('created', 'pending', 'success', 'failed', 'refunded');

create type public.lead_status as enum (
  'new', 'contacted', 'interested', 'site_visit', 'negotiation', 'closed', 'not_interested'
);

-- --------------------------------------------------------------------------
-- Trust & safety
-- --------------------------------------------------------------------------

create type public.report_reason as enum (
  'fake_property',
  'duplicate',
  'wrong_price',
  'sold_property',
  'wrong_contact',
  'fraud',
  'spam',
  'misleading_information',
  'other'
);

create type public.report_status as enum ('open', 'under_review', 'resolved', 'dismissed');

create type public.notification_type as enum (
  'payment',
  'contact_unlock',
  'property_approved',
  'property_rejected',
  'new_lead',
  'property_expiry',
  'verification',
  'saved_property',
  'system'
);
