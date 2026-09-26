-- ===========================================================================
-- 99Estate — 016 · Video tour link
-- ---------------------------------------------------------------------------
-- A seller (or an admin posting on their behalf) can attach one YouTube or
-- Vimeo link to a listing. Nothing is uploaded here: the host stores it,
-- transcodes it, serves the adaptive stream and pays the bandwidth.
--
-- The CHECK is the point of this migration, not the column.
--
-- `video_url` is rendered inside an `<iframe src>`, which makes an unconstrained
-- text column a way to frame arbitrary content on a page carrying our name — a
-- counterfeit payment form being the obvious abuse. lib/properties/video.ts
-- parses a pasted link down to a provider and an id and rebuilds it, so the app
-- only ever writes the two shapes below; this constraint is what holds when
-- something writes around the app.
--
-- Deliberately narrow: exactly the canonical forms that module emits, anchored
-- at both ends, so no query string, no userinfo, no second host can ride along.
-- A future provider means a migration, which is the right amount of friction
-- for adding to an allowlist.
--
-- Re-runnable: applied by pasting into the Supabase SQL Editor.
-- ===========================================================================

alter table public.properties
  add column if not exists video_url text;

comment on column public.properties.video_url is
  'Canonical YouTube or Vimeo URL for the listing video tour. Written only as https://www.youtube.com/watch?v=<11-char id> or https://vimeo.com/<digits>; see lib/properties/video.ts. Embedded via youtube-nocookie.com / player.vimeo.com with do-not-track on.';

alter table public.properties
  drop constraint if exists properties_video_url_check;

alter table public.properties
  add constraint properties_video_url_check check (
    video_url is null
    or video_url ~ '^https://www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}$'
    or video_url ~ '^https://vimeo\.com/[0-9]{6,12}$'
  );
