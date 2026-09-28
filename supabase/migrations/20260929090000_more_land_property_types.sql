-- ===========================================================================
-- 020 — three more land types: vacant, farm, investment.
-- ---------------------------------------------------------------------------
-- Sellers around Coimbatore list plots far more often than the original
-- vocabulary allowed for. "Agricultural Land" was carrying too much: a bare
-- site, a working farm and a hold-for-appreciation parcel are described and
-- priced differently, and a buyer filtering for one does not want the others.
--
-- Appended after `agricultural_land` rather than slotted in beside the other
-- plot types, because enum order is physical. Inserting BEFORE an existing
-- value rewrites the sort order of a type already stored in a few hundred
-- thousand index entries, and nothing here depends on that order — every
-- dropdown takes its order from PROPERTY_TYPE_LABELS in lib/constants.ts.
--
-- RUN THIS FILE ON ITS OWN, then run 021. Postgres will not let a value added
-- by ALTER TYPE be *used* in the same transaction that added it, and 021
-- assigns these to a category. Two statements in one editor tab is one
-- transaction, which is why they are two files rather than one.
-- ===========================================================================

alter type public.property_type add value if not exists 'vacant_land'     after 'agricultural_land';
alter type public.property_type add value if not exists 'farm_land'       after 'vacant_land';
alter type public.property_type add value if not exists 'investment_land' after 'farm_land';
