import { createAdminClient } from '@/lib/supabase/admin';

/**
 * §16 — puts server-side failures into the same log an admin already reads.
 *
 * `client_errors` was built for the browser, on the stated premise that
 * "server errors go to the Vercel log". That premise is what hid a real
 * outage: a non-function export in `lib/properties/actions.ts` made every
 * Server Action in that file throw, step 3 of the posting wizard answered 500
 * to every seller, and /admin/errors stayed empty the whole time. The failure
 * was perfectly visible — in a log nobody opens.
 *
 * So the same table now takes both halves. Nothing about the schema changes:
 * these are recorded under the existing `unexpected` kind with
 * `context.source = 'server'`, which keeps the CHECK constraint untouched and
 * means this works against the live database the moment it deploys. Filtering
 * server from browser is `context.source`, not a new `kind`.
 *
 * Written with the service role on purpose. The row has to be insertable when
 * nobody is signed in and when there is no request session to read — a 500 on
 * an anonymous listing page is exactly the kind we must not drop — and
 * `client_errors_insert_own` requires `user_id = auth.uid()`, which an
 * unauthenticated crash can never satisfy.
 */

/** Mirrors the `client_errors_size_check` constraint. */
const MAX_MESSAGE = 500;
const MAX_CONTEXT = 2000;

/**
 * One row per distinct failure per minute.
 *
 * The bug this exists for answered 500 to *every* attempt. Without a throttle,
 * one bad deploy plus a few sellers retrying writes thousands of identical
 * rows, which buries the log it is supposed to make readable and is the one way
 * a diagnostic can make an incident worse. The goal here is a representative
 * row, not a counter — the Vercel log still has every occurrence.
 */
const THROTTLE_MS = 60_000;
const THROTTLE_MAX_KEYS = 500;
const lastSeen = new Map<string, number>();

function shouldReport(key: string, now: number): boolean {
  const seen = lastSeen.get(key);
  if (seen !== undefined && now - seen < THROTTLE_MS) return false;

  // Bounded so a high-cardinality key (a path with an id in it) cannot grow
  // this map without limit in a long-lived server process.
  if (lastSeen.size >= THROTTLE_MAX_KEYS) lastSeen.clear();

  lastSeen.set(key, now);
  return true;
}

export type ServerErrorRequest = {
  path?: string;
  method?: string;
  /** Next hands these over as `string | string[]` — a header may repeat. */
  headers?: Record<string, string | string[] | undefined>;
};

/** First value wins; a repeated `user-agent` or `cookie` is not worth joining. */
function header(headers: ServerErrorRequest['headers'], name: string): string | null {
  const value = headers?.[name];
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return null;
}

export type ServerErrorContext = {
  routerKind?: string;
  routePath?: string;
  routeType?: string;
};

/**
 * Trims the stack until the whole context fits the column's CHECK.
 *
 * The stack is the only part worth truncating — every other field is short and
 * is what makes the row findable. Dropping the stack entirely would have made
 * this specific bug much harder to place, since the useful frame was
 * `ensureServerEntryExports`, not anything in our own code.
 */
function fitContext(base: Record<string, unknown>, stack: string | null): Record<string, unknown> {
  if (!stack) return base;

  const overhead = JSON.stringify({ ...base, stack: '' }).length;
  const room = MAX_CONTEXT - overhead - 16; // 16 covers JSON escaping of the stack
  if (room <= 0) return base;

  return { ...base, stack: stack.length > room ? `${stack.slice(0, room - 1)}…` : stack };
}

/**
 * Best-effort by construction, like `reportClientError`.
 *
 * Every path returns rather than throwing. This runs *while Next is already
 * handling an error*, so anything thrown from here would replace a real
 * failure with a reporting failure and tell us even less than we had.
 */
export async function reportServerError(
  error: unknown,
  request: ServerErrorRequest = {},
  context: ServerErrorContext = {},
): Promise<void> {
  try {
    const err = error as { name?: string; message?: string; stack?: string; digest?: string } | null;

    const name = typeof err?.name === 'string' && err.name ? err.name : 'Error';
    const rawMessage = typeof err?.message === 'string' ? err.message : String(error ?? 'Unknown error');
    const message = `${name}: ${rawMessage}`.replace(/\s+/g, ' ').trim().slice(0, MAX_MESSAGE) || 'Error';

    const path = request.path ?? context.routePath ?? null;
    const routeType = context.routeType ?? null;

    // `digest` is what the browser is shown and what the platform log prints,
    // so it is the one value that ties this row to the other two places the
    // same failure appears.
    const digest = typeof err?.digest === 'string' ? err.digest : null;

    const now = Date.now();
    if (!shouldReport(`${digest ?? message}|${path ?? ''}|${routeType ?? ''}`, now)) return;

    const userAgent = header(request.headers, 'user-agent')?.slice(0, 400) ?? null;

    /**
     * Whether a session cookie was present, never whose it was.
     *
     * The cookie is right here in the headers, but its JWT has not been
     * verified at this point and nothing in this path can verify it — treating
     * `sub` as a user id would let a forged cookie attribute a crash to an
     * innocent account in a table admins use to diagnose. "Signed in or not"
     * is the part that is actually useful for reproducing, and it is safe to
     * record.
     */
    const signedIn = /(^|;\s*)sb-[^=]*-auth-token/.test(header(request.headers, 'cookie') ?? '');

    const body = fitContext(
      {
        source: 'server',
        digest,
        path,
        method: request.method ?? null,
        route_type: routeType,
        route_path: context.routePath ?? null,
        router_kind: context.routerKind ?? null,
        runtime: process.env.NEXT_RUNTIME ?? 'nodejs',
        signed_in: signedIn,
      },
      typeof err?.stack === 'string' ? err.stack : null,
    );

    const supabase = createAdminClient();
    await supabase.from('client_errors').insert({
      // Null on purpose: see the note on `signed_in` above. The column is
      // nullable and the admin page already renders a row without a reporter.
      user_id: null,
      kind: 'unexpected',
      message,
      context: body as never,
      user_agent: userAgent,
    });
  } catch {
    // Swallowed for the same reason `reportClientError` swallows: there is
    // nowhere left to report a failure to report a failure.
  }
}
