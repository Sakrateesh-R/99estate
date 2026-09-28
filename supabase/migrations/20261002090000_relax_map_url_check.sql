-- ===========================================================================
-- 99Estate — 024 · The map link CHECK stops guessing at path shapes
-- ---------------------------------------------------------------------------
-- Migration 022 pinned `map_url` to specific path shapes and rejected the
-- commonest link there is:
--
--   new row for relation "properties" violates check constraint
--   "properties_map_url_check"
--
-- Google's share sheet appends its own tracking parameter, so a link copied
-- from a phone is `https://maps.app.goo.gl/AbCd1234?g_st=ic` — and the old
-- pattern was anchored right after the id. Five other legitimate forms failed
-- the same way: a trailing slash, `maps.google.com` without a path,
-- `goo.gl/maps/x?y`, and anything pasted without `https://`.
--
-- The app said yes to all of them and the insert then failed on the constraint,
-- which is the worst of both answers — the seller was told their link was
-- recognised and then told the save was impossible, with nothing to fix.
--
-- The mistake was making the constraint stricter than the parser. It cannot be
-- the precise gate: lib/properties/map-link.ts parses with `URL`, which handles
-- userinfo, ports, punycode and percent-encoding that a regex will keep getting
-- wrong. So the division of labour is now explicit:
--
--   the app  decides whether a link is usable, and normalises what is stored
--   this CHECK pins the scheme, the host and a length, and nothing else
--
-- That is all the constraint was ever protecting. `map_url` is provenance: the
-- coordinates are what the page renders, the iframe src is built from those two
-- numbers, and the "Open in Google Maps" link is built from them too. This value
-- reaches no `src` and no `href` — it is only ever shown back to the seller in
-- the input they typed it into.
--
-- Re-runnable: applied by pasting into the Supabase SQL Editor.
-- ===========================================================================

alter table public.properties
  drop constraint if exists properties_map_url_check;

alter table public.properties
  add constraint properties_map_url_check check (
    map_url is null
    or (
      length(map_url) <= 2048
      and map_url ~ '^https://(maps\.app\.goo\.gl|(www\.)?goo\.gl|(www\.|maps\.)?google\.(com|co\.in))(/|$)'
    )
  );

comment on column public.properties.map_url is
  'The Google Maps link the seller gave, normalised to https:// by lib/properties/map-link.ts. Provenance only: coordinates are parsed out of it into latitude/longitude, and it is never used as an iframe src or an href. The CHECK pins scheme, host and length; the app decides whether a link is actually usable.';
