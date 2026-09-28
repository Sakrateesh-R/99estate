-- ===========================================================================
-- 021 — the new land types join the "Plots & Land" category.
-- ---------------------------------------------------------------------------
-- `property_categories` is what the browse-by-category navigation reads. A type
-- missing from every row is still listable and still searchable, but it falls
-- out of the category links — so a Vacant Land listing would exist and be
-- findable by filter while being absent from the one place people browse.
--
-- Separate from 020 because this *uses* the values that migration adds, and
-- Postgres refuses that inside the same transaction.
-- ===========================================================================

update public.property_categories
set property_types = array[
      'residential_plot',
      'commercial_plot',
      'agricultural_land',
      'vacant_land',
      'farm_land',
      'investment_land'
    ]::public.property_type[]
where slug = 'plots-land';
