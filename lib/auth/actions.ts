'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSiteUrl } from '@/lib/env';
import { clearAuthError, setAuthError } from '@/lib/auth/return-to';

/**
 * Starts the Google OAuth dance.
 *
 * `redirectTo` carries no query string. The destination the user was heading
 * to lives in the return-to cookie, which survives the round trip out to
 * Google and back because it is `SameSite=Lax` and the return is a top-level
 * GET navigation.
 */
export async function signInWithGoogle() {
  await clearAuthError();

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${getSiteUrl()}/auth/callback`,
      queryParams: {
        // Always show the account chooser: shared devices are common, and a
        // silent re-login into the wrong account is confusing on a marketplace.
        prompt: 'select_account',
      },
    },
  });

  if (error || !data?.url) {
    await setAuthError(error?.message ?? 'Could not start Google sign-in.');
    redirect('/login');
  }

  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/');
}
