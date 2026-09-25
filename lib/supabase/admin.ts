import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { env, getServerEnv } from '@/lib/env';
import type { Database } from '@/types/database.types';

/**
 * Service-role client. Bypasses RLS entirely.
 *
 * Only two callers are legitimate:
 *   1. the payment webhook, which must settle an unlock for a user whose
 *      session it does not hold;
 *   2. scheduled maintenance (listing expiry sweeps).
 *
 * Anything a signed-in user initiates must use `lib/supabase/server.ts` so the
 * policies still apply. Importing this module from a Client Component throws.
 */
let adminClient: ReturnType<typeof createSupabaseClient<Database>> | null = null;

export function createAdminClient() {
  if (typeof window !== 'undefined') {
    throw new Error('The Supabase service-role client must never be created in the browser.');
  }

  if (!adminClient) {
    adminClient = createSupabaseClient<Database>(
      env.NEXT_PUBLIC_SUPABASE_URL,
      getServerEnv().SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      },
    );
  }

  return adminClient;
}
