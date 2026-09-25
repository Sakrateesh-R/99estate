'use client';

import { createBrowserClient } from '@supabase/ssr';
import { env } from '@/lib/env';
import type { Database } from '@/types/database.types';

/**
 * Browser Supabase client. Carries the anon key only — every privileged
 * operation goes through a Server Action or Route Handler instead.
 *
 * `createBrowserClient` memoises internally, but we keep a module-level
 * reference so React re-renders never spin up a second GoTrue instance.
 */
let browserClient: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createClient() {
  if (!browserClient) {
    browserClient = createBrowserClient<Database>(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
  }
  return browserClient;
}
