-- ===========================================================================
-- 99Estate — 025 · A place for errors that happen in the browser
-- ---------------------------------------------------------------------------
-- Server errors go to the Vercel log. Errors in the browser go nowhere, and
-- that has already cost us twice: view tracking was dead for weeks behind a
-- bare `catch {}`, and roughly one photo in ten is still being stored
-- uncompressed because the image pipeline gives up silently and nobody can see
-- why.
--
-- This is the narrow fix for that: somewhere for the client to say "this failed
-- and here is what I know", and an admin page to read it.
--
-- Deliberately not a general telemetry sink. `kind` is constrained to a short
-- list so the table cannot quietly become a dumping ground, and every text
-- field is length-capped — this is writable by any signed-in user, so it has
-- to be bounded by the schema rather than by good manners in the client.
--
-- Re-runnable: applied by pasting into the Supabase SQL Editor.
-- ===========================================================================

create table if not exists public.client_errors (
  id         uuid primary key default gen_random_uuid(),
  /**
   * Who hit it. Kept so a repeated failure can be traced to one account and
   * one device, which is most of diagnosing this kind of thing. Nulled rather
   * than cascaded on account deletion: the error is still worth reading, the
   * person is not the point.
   */
  user_id    uuid references public.profiles(id) on delete set null,
  kind       text not null,
  message    text not null,
  /** Whatever the caller knows: file size, mime type, which branch gave up. */
  context    jsonb not null default '{}'::jsonb,
  user_agent text,
  created_at timestamptz not null default now()
);

comment on table public.client_errors is
  'Failures that happen in the browser, reported by the client so an admin can see them. Insert-only for signed-in users; readable by admins. See /admin/errors.';

alter table public.client_errors
  drop constraint if exists client_errors_kind_check;

alter table public.client_errors
  add constraint client_errors_kind_check check (
    kind in ('image_compression', 'image_upload', 'payment', 'unexpected')
  );

alter table public.client_errors
  drop constraint if exists client_errors_size_check;

alter table public.client_errors
  add constraint client_errors_size_check check (
    length(message) between 1 and 500
    and length(coalesce(user_agent, '')) <= 400
    and length(context::text) <= 2000
  );

create index if not exists client_errors_recent_idx
  on public.client_errors (created_at desc);

create index if not exists client_errors_kind_idx
  on public.client_errors (kind, created_at desc);

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
alter table public.client_errors enable row level security;

drop policy if exists client_errors_insert_own on public.client_errors;
drop policy if exists client_errors_select_admin on public.client_errors;
drop policy if exists client_errors_no_update on public.client_errors;

/**
 * Anyone signed in may report their own failure, and only their own — a report
 * attributed to somebody else would make the log worse than useless.
 */
create policy client_errors_insert_own on public.client_errors
  for insert to authenticated
  with check (user_id = auth.uid());

/**
 * Only admins read it. A `user_agent` and a failure pattern is more about a
 * person than it first looks, and nobody else has a reason to see it.
 */
create policy client_errors_select_admin on public.client_errors
  for select to authenticated
  using (public.is_admin());

-- No update or delete policy at all: a log that can be edited is not a log.
-- Pruning is done by the service role, which bypasses RLS.

/**
 * Keeps the table from growing without bound.
 *
 * Called by the nightly sweep alongside listing expiry. Thirty days is long
 * enough to spot a pattern and short enough that this never becomes a cost.
 */
create or replace function public.prune_client_errors(p_keep_days int default 30)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  if not (public.is_admin() or auth.role() = 'service_role') then
    raise exception 'not authorised';
  end if;

  delete from public.client_errors
  where created_at < now() - make_interval(days => greatest(p_keep_days, 1));

  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.prune_client_errors(int) from public;
grant execute on function public.prune_client_errors(int) to authenticated, service_role;
