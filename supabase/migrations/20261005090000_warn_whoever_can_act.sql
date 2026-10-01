-- ===========================================================================
-- 99Estate — 027 · Warn the person who can actually renew
-- ---------------------------------------------------------------------------
-- `notify_expiring_properties` notifies `seller_id`. For 34 of the 36 listings
-- on this site that is a placeholder account with no usable email, created when
-- an admin posted on a walk-in owner's behalf — an account that cannot sign in
-- and will therefore never see the notification.
--
-- So the warning was being addressed, correctly and uselessly, to somebody who
-- could not read it, about an action only somebody else could take.
--
-- Now both are told: the owner, in case they can sign in, and the admin who
-- posted it, who in practice is the one who will renew. Each gets their own
-- de-duplication check, so telling one does not silence the other, and each
-- gets a link to the page where they can act on it.
--
-- This matters on a deadline rather than in principle: thirty of thirty-six
-- listings expire between 25 and 28 December 2026, and the warnings fire seven
-- days earlier.
--
-- Re-runnable: applied by pasting into the Supabase SQL Editor.
-- ===========================================================================

create or replace function public.notify_expiring_properties(p_days_ahead integer default 7)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_row       record;
  v_recipient uuid;
  v_count     integer := 0;
begin
  if not (public.is_admin() or public.is_service_role()) then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  for v_row in
    select p.id, p.seller_id, p.posted_by, p.title, p.expires_at
    from public.properties p
    where p.status = 'published'
      and p.expires_at between now() and now() + make_interval(days => p_days_ahead)
  loop
    /**
     * The owner and whoever posted it for them — distinct, and never null.
     * `posted_by` is NULL on a self-posted listing, which collapses this back
     * to exactly the previous behaviour.
     */
    for v_recipient in
      select distinct r
      from unnest(array[v_row.seller_id, v_row.posted_by]) as r
      where r is not null
    loop
      -- Per recipient, so notifying the admin does not count as having
      -- notified the owner, or the other way round.
      if not exists (
        select 1 from public.notifications n
        where n.user_id = v_recipient
          and n.type = 'property_expiry'
          and n.data ->> 'property_id' = v_row.id::text
          and n.created_at > coalesce(
            (select coalesce(p2.last_renewed_at, p2.published_at, p2.created_at)
             from public.properties p2 where p2.id = v_row.id),
            now() - interval '100 years'
          )
      ) then
        v_count := v_count + 1;
        perform public.create_notification(
          v_recipient,
          'Listing expiring soon',
          v_row.title || ' expires on ' ||
            to_char(v_row.expires_at at time zone 'Asia/Kolkata', 'DD Mon YYYY') || '.',
          'property_expiry',
          -- Sent where the recipient can do something about it.
          case
            when v_recipient = v_row.posted_by and v_recipient is distinct from v_row.seller_id
              then '/admin/expiring'
            else '/dashboard/properties'
          end,
          jsonb_build_object('property_id', v_row.id, 'expires_at', v_row.expires_at)
        );
      end if;
    end loop;
  end loop;

  return v_count;
end;
$$;
