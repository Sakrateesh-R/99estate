import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runListingMaintenance } from '@/lib/properties/maintenance';
import { getServerEnv } from '@/lib/env';

/**
 * §18 — the scheduled half of the listing lifecycle.
 *
 * Expiry cannot live in the app's request path: nothing a user does is
 * guaranteed to happen on the day a listing runs out, and a listing that
 * expires only when somebody happens to load a page is not expiring on a
 * schedule at all. So this endpoint exists to be called by a clock.
 *
 * It is an HTTP endpoint rather than pg_cron because the hosted project's
 * migration history is out of sync with the CLI, and scheduling inside
 * Postgres would mean another migration that has to be pasted in by hand. Any
 * scheduler can drive this one — `vercel.json` does it in production, and a
 * curl with the right header does it anywhere else.
 *
 * Runs as the service role: there is no signed-in user at 00:00, and the RPCs
 * require `is_admin() or is_service_role()`.
 */

// Reads a secret from the request and must never be cached or prerendered.
export const dynamic = 'force-dynamic';

/**
 * Constant-time comparison of the whole `Authorization` header.
 *
 * `timingSafeEqual` throws when the buffers differ in length, so the length is
 * checked first — and short-circuiting there leaks only the length of a header
 * the caller already sent, not of the secret.
 */
function isAuthorised(request: NextRequest, secret: string): boolean {
  const presented = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);

  return presented.length === expected.length && timingSafeEqual(presented, expected);
}

async function handle(request: NextRequest) {
  const secret = getServerEnv().CRON_SECRET;

  /**
   * No secret configured means the endpoint stays shut. The alternative —
   * running the sweep for anyone who finds the URL — would let a stranger
   * trigger notifications to every seller on the platform, over and over.
   */
  if (!secret) {
    console.error('[cron] CRON_SECRET is not set; refusing to run the listing sweep.');
    return NextResponse.json({ error: 'cron is not configured' }, { status: 503 });
  }

  if (!isAuthorised(request, secret)) {
    // Terse on purpose: a probe of this endpoint learns nothing from it.
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }

  try {
    const result = await runListingMaintenance(createAdminClient());

    // Logged as well as returned: the scheduler's own history is usually the
    // only place anyone looks when asking whether this ran last night.
    console.info(
      `[cron] listing sweep: expired ${result.expired}, warned ${result.warned}.`,
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'unknown error';
    console.error('[cron] listing sweep failed:', cause);

    // 500 rather than a cheerful 200: a scheduler that treats this as success
    // will never tell anyone the lifecycle stopped running.
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET is what Vercel Cron sends. POST is accepted too, because most other
 * schedulers default to it and being picky about the verb would be a
 * configuration trap with no upside.
 */
export const GET = handle;
export const POST = handle;
