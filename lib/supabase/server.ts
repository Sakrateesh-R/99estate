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
