-- ===========================================================================
-- 99Estate — 022 · Location from a Google Maps link
-- ---------------------------------------------------------------------------
-- The wizard asked for latitude and longitude as two number fields, which is a
-- question almost nobody can answer about their own plot. A seller standing on
-- the land can share it from the Maps app in two taps, so that is what we now
-- accept; lib/properties/map-link.ts reads the coordinates out of the link.
--
-- Coordinates stay the stored truth. They are what the map embed, the `geo`
-- block in the listing's structured data and any future distance sort all need,
-- and they keep working when Google changes its URL shapes or the link rots.
-- `map_url` sits alongside them as provenance — the thing the seller actually
-- pointed at, so it can be shown back to them when they edit.
--
-- The CHECK is again the point of the migration rather than the column, but for
-- a narrower reason than video_url had. This value is never put in an iframe:
-- the embed src is built from the two numbers, so it is always
-- google.com/maps?q=<digits>,<digits>&output=embed no matter what was pasted.
-- What the column can still become is an outbound link with our name on it,
-- which is enough reason to pin it to hosts that belong to Google Maps.
--
-- Left deliberately looser than the video constraint, because unlike a video id
-- there is no single canonical form to reduce a place to — a link may be a
-- share link, a place URL or a coordinate query, and all three are legitimate.
--
-- Re-runnable: applied by pasting into the Supabase SQL Editor.
-- ===========================================================================

alter table public.properties
  add column if not exists map_url text;

comment on column public.properties.map_url is
  'The Google Maps link the seller gave for this property, kept as provenance. Coordinates are parsed out of it into latitude/longitude, which is what the app renders; this column is never used as an iframe src. See lib/properties/map-link.ts.';

alter table public.properties
  drop constraint if exists properties_map_url_check;

alter table public.properties
  add constraint properties_map_url_check check (
    map_url is null
    -- Share links: an opaque id, resolved server-side when the draft is saved.
    or map_url ~ '^https://maps\.app\.goo\.gl/[A-Za-z0-9_-]{4,64}$'
    or map_url ~ '^https://goo\.gl/maps/[A-Za-z0-9_-]{4,64}$'
    -- Long links: google.com/maps, google.co.in/maps, maps.google.com, and the
    -- www variants. Length-capped so the column cannot be used as free storage.
    or (
      length(map_url) <= 2048
      and map_url ~ '^https://(www\.)?(google\.(com|co\.in)/maps|maps\.google\.(com|co\.in)/)'
    )
  );

-- Sellers who already typed coordinates in keep them; this only adds a way to
-- arrive at the same two numbers. No backfill, and nothing is dropped.
