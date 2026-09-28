-- ===========================================================================
-- 99Estate — 023 · A short public code for listing URLs
-- ---------------------------------------------------------------------------
-- Listing URLs ended in a raw UUID:
--
--   /property/residential-plot-for-sale-kozhikode-9b25e91b-3c1f-4297-9fe2-94dc1ab40540
--
-- Thirty-six characters of database plumbing on the end of every link a seller
-- shares on WhatsApp. This replaces it with seven:
--
--   /property/residential-plot-for-sale-kozhikode-K7M2QX4
--
-- Why a random code rather than the two obvious alternatives:
--
--   A sequential number is shorter still and publishes the inventory count. A
--   competitor reading /property/…-42 learns how many listings exist, and
--   reading it again next week learns the growth rate. That is a real thing to
--   give away while the site is small.
--
--   The slug alone is prettiest and makes the URL change whenever a seller
--   edits their title — either breaking the link or needing a redirect table to
--   avoid it. It also collides: there are already four listings that would want
--   to be `residential-plot-for-sale-coimbatore`. Keeping an opaque token on the
--   end is exactly what lets the slug stay editable, which is why the UUID was
--   there in the first place; this only makes the token smaller.
--
-- Alphabet is Crockford's base32 — no I, L, O or U — so the code cannot be
-- misread down a phone line or turn into a word. Uppercase, which also keeps it
-- unambiguous against the lowercase slug in front of it, so the router can tell
-- `…-kozhikode-K7M2QX4` from a slug that merely ends in a short word.
--
-- 32^7 is about 34 billion. At 10,000 listings the chance of any collision at
-- all is roughly one in seven million, and the unique index turns even that into
-- a retry rather than a wrong row.
--
-- Re-runnable: applied by pasting into the Supabase SQL Editor.
-- ===========================================================================

alter table public.properties
  add column if not exists public_code text;

comment on column public.properties.public_code is
  'Short opaque identifier used in the listing URL instead of the UUID. Crockford base32, 7 characters, assigned by trigger and never reused. See lib/utils.ts propertyPath().';

-- ---------------------------------------------------------------------------
-- Generation
-- ---------------------------------------------------------------------------
create or replace function public.generate_property_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  -- Crockford base32: 0-9 and A-Z without I, L, O, U.
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  code text := '';
  i int;
begin
  for i in 1..7 loop
    code := code || substr(alphabet, 1 + floor(random() * 32)::int, 1);
  end loop;
  return code;
end;
$$;

/**
 * Assigns the code on insert, retrying on the astronomically unlikely clash.
 *
 * A trigger rather than a column default because the uniqueness check has to be
 * part of generating it. Bounded at 12 attempts so a genuinely broken state
 * fails loudly instead of spinning.
 */
create or replace function public.properties_set_public_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate text;
  attempts int := 0;
begin
  if new.public_code is not null then
    return new;
  end if;

  loop
    candidate := public.generate_property_code();
    exit when not exists (select 1 from public.properties where public_code = candidate);

    attempts := attempts + 1;
    if attempts >= 12 then
      raise exception 'could not allocate a unique property code after % attempts', attempts;
    end if;
  end loop;

  new.public_code := candidate;
  return new;
end;
$$;

drop trigger if exists properties_set_public_code on public.properties;

create trigger properties_set_public_code
  before insert on public.properties
  for each row execute function public.properties_set_public_code();

-- ---------------------------------------------------------------------------
-- Backfill, then lock it down
-- ---------------------------------------------------------------------------
-- One at a time rather than a set-based update: each new code has to be checked
-- against the codes already handed out in this same statement, which a single
-- UPDATE cannot see.
do $$
declare
  row_id uuid;
  candidate text;
  attempts int;
begin
  for row_id in select id from public.properties where public_code is null loop
    attempts := 0;
    loop
      candidate := public.generate_property_code();
      exit when not exists (select 1 from public.properties where public_code = candidate);
      attempts := attempts + 1;
      if attempts >= 12 then
        raise exception 'could not allocate a unique property code';
      end if;
    end loop;
    update public.properties set public_code = candidate where id = row_id;
  end loop;
end;
$$;

create unique index if not exists properties_public_code_key
  on public.properties (public_code);

alter table public.properties
  alter column public_code set not null;

-- The shape the router trusts. Anchored, so nothing longer or lowercase can be
-- written and then fail to route.
alter table public.properties
  drop constraint if exists properties_public_code_check;

alter table public.properties
  add constraint properties_public_code_check check (
    public_code ~ '^[0-9A-HJKMNP-TV-Z]{7}$'
  );

-- Codes are permanent: a URL that has been shared or indexed must not start
-- pointing somewhere else, and must never be reassigned to a different listing.
create or replace function public.properties_public_code_is_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.public_code is distinct from old.public_code then
    raise exception 'public_code cannot be changed once assigned';
  end if;
  return new;
end;
$$;

drop trigger if exists properties_public_code_immutable on public.properties;

create trigger properties_public_code_immutable
  before update of public_code on public.properties
  for each row execute function public.properties_public_code_is_immutable();
