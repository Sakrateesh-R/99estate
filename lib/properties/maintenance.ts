import type { SupabaseClient } from '@supabase/supabase-js';
import { EXPIRY_WARNING_DAYS } from '@/lib/constants';
import type { Database } from '@/types/database.types';

/**
 * §18 — the listing lifecycle sweep.
 *
 * `expire_stale_properties` and `notify_expiring_properties` have existed in
 * Postgres since the schema went in and had no caller, which meant the 90-day
 * lifecycle never actually ran: listings stayed live past `expires_at` for as
 * long as the database was up, and the seven-day warning was never sent.
 *
 * Takes a client rather than creating one. Both RPCs are gated on `is_admin()
 * or is_service_role()`, so each caller passes whichever client it is already
 * entitled to use — the cron route a service-role client, the admin button the
 * signed-in admin's own. A helper that built its own privileged client would
 * quietly hand service-role reach to every future caller that imported it.
 */

export type MaintenanceResult = {
  /** Listings moved from `published` to `expired`. */
  expired: number;
  /** Sellers sent a warning about a listing expiring soon. */
  warned: number;
};

/**
 * Safe to run repeatedly. `expire_stale_properties` only touches published
 * listings already past `expires_at`, and `notify_expiring_properties` skips
 * any listing whose seller has already been warned in the current cycle — so a
 * scheduler that fires twice, or retries, changes nothing the second time.
 */
export async function runListingMaintenance(
  supabase: SupabaseClient<Database>,
): Promise<MaintenanceResult> {
  /**
   * Order does not matter. A listing the sweep has just expired is no longer
   * `published`, so it drops out of the warning window by itself rather than
   * being warned about an expiry that has already happened.
   */
  const expired = await supabase.rpc('expire_stale_properties');
  if (expired.error) throw new Error(`expire_stale_properties: ${expired.error.message}`);

  const warned = await supabase.rpc('notify_expiring_properties', {
    p_days_ahead: EXPIRY_WARNING_DAYS,
  });
  if (warned.error) throw new Error(`notify_expiring_properties: ${warned.error.message}`);

  return { expired: expired.data ?? 0, warned: warned.data ?? 0 };
}
