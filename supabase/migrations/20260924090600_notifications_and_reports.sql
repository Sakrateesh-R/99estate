-- ===========================================================================
-- 99Estate — 007 · Notifications and property reports
-- ---------------------------------------------------------------------------
-- Notifications are created earlier in the migration order than leads and
-- unlocks because those tables' triggers write into this one.
-- ===========================================================================

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  title      text not null,
  message    text,
  type       public.notification_type not null default 'system',
  -- Deep link into the app, e.g. /dashboard/leads or /property/<slug>-<id>.
  link       text,
  -- Extra payload for rendering (property id, amount, ...). Never secrets.
  data       jsonb not null default '{}'::jsonb,
  is_read    boolean not null default false,
  created_at timestamptz not null default now(),

  constraint notifications_title_check check (char_length(trim(title)) between 2 and 160),
  constraint notifications_message_check check (message is null or char_length(message) <= 1000),
  constraint notifications_link_check check (link is null or link ~ '^/')
);

-- The bell menu reads "my unread, newest first" on nearly every page load.
create index notifications_inbox_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where not is_read;

-- Single writer for every in-app notification. SECURITY DEFINER because the
-- callers (triggers, RPCs, webhooks) act on behalf of *another* user — a buyer
-- unlocking a contact causes a notification row owned by the seller.
create or replace function public.create_notification(
  p_user_id uuid,
  p_title   text,
  p_message text default null,
  p_type    public.notification_type default 'system',
  p_link    text default null,
  p_data    jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_user_id is null then
    return null;
  end if;

  insert into public.notifications (user_id, title, message, type, link, data)
  values (p_user_id, left(p_title, 160), left(p_message, 1000), p_type, p_link, coalesce(p_data, '{}'::jsonb))
  returning id into v_id;

  return v_id;
end;
$$;

-- Not callable from the browser: clients must never be able to forge a
-- "Payment successful" notification.
revoke all on function public.create_notification(uuid, text, text, public.notification_type, text, jsonb) from public, anon, authenticated;

-- ===========================================================================
-- Property reports (§17)
-- ===========================================================================

create table public.property_reports (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason      public.report_reason not null,
  description text,
  status      public.report_status not null default 'open',
  admin_notes text,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint property_reports_description_check check (description is null or char_length(description) <= 2000),
  -- "Other" is only actionable with an explanation.
  constraint property_reports_other_needs_detail_check
    check (reason <> 'other' or char_length(coalesce(trim(description), '')) >= 10),
  -- One open report per person per listing; stops report-bombing.
  constraint property_reports_unique_reporter unique (property_id, reporter_id)
);

create index property_reports_property_idx on public.property_reports (property_id, created_at desc);
create index property_reports_queue_idx on public.property_reports (status, created_at desc);
create index property_reports_reporter_idx on public.property_reports (reporter_id, created_at desc);

create trigger property_reports_set_updated_at
  before update on public.property_reports
  for each row execute function public.set_updated_at();

-- Reporters may file; only admins may triage.
-- SECURITY INVOKER on purpose — see is_trusted_writer().
create or replace function public.property_reports_guard_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_trusted_writer() or public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.reporter_id is distinct from auth.uid() then
      raise exception 'reporter_id must match the authenticated user' using errcode = '42501';
    end if;
    if public.owns_property(new.property_id) then
      raise exception 'you cannot report your own listing' using errcode = '42501';
    end if;
    new.status      := 'open';
    new.admin_notes := null;
    new.resolved_by := null;
    new.resolved_at := null;
    return new;
  end if;

  raise exception 'reports can only be updated by an administrator' using errcode = '42501';
end;
$$;

create trigger property_reports_guard_write_trg
  before insert or update on public.property_reports
  for each row execute function public.property_reports_guard_write();
