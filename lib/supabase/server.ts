import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';
import type { Database } from '@/types/database.types';

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 *
 * Runs as the signed-in user, so every query is still subject to RLS — this
 * client is *not* a way around the policies, it is the normal path.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components cannot mutate cookies. Refresh is handled by
            // middleware, so swallowing this is the documented behaviour.
          }
        },
      },
    },
  );
}

/**
 * A client that is still usable inside `after()`.
 *
 * Request APIs belong to the request, and `after()` runs once the response has
 * gone — reaching for `cookies()` or `headers()` in there throws. The ordinary
 * client looks safe because it awaits `cookies()` up front, but its `getAll`
 * closes over the live store and is called later, when the query runs.
 *
 * So the jar is read now and frozen. The session travels in that snapshot,
 * which is the point: `auth.uid()` is how the database knows not to count a
 * seller viewing their own listing, and an anonymous client would lose that.
 *
 * Nothing here can write a cookie. A deferred task has no response left to set
 * one on, so token refresh stays where it belongs, in middleware.
 */
export async function createDeferredClient() {
  const snapshot = (await cookies()).getAll().map(({ name, value }) => ({ name, value }));

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return snapshot;
        },
        setAll() {
          // Deliberately empty: see above.
        },
      },
    },
  );
}
