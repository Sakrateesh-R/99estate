import { cache } from 'react';
import { redirect } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import type { Tables } from '@/types/database.types';

export type Profile = Tables<'profiles'>;

/**
 * Current user, verified against the auth server.
 *
 * Wrapped in React `cache` so a page that checks auth in the layout, the page
 * and three server components still makes one request.
 */
export const getUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/** The signed-in user's profile row, or null when signed out. */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const user = await getUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();

  return data ?? null;
});

/** Convenience pair for headers and nav. */
export const getAuthContext = cache(async () => {
  const [user, profile] = await Promise.all([getUser(), getProfile()]);
  return { user, profile, isSignedIn: Boolean(user) };
});

/**
 * Redirects to Google sign-in when there is no session.
 *
 * No `?next=` is appended: middleware has already recorded the destination in
 * the return-to cookie before this ever runs. These guards are the belt to
 * middleware's braces — they fire on direct RSC requests or if the matcher
 * ever drifts — so losing the destination in that rare path is acceptable,
 * and a Server Component cannot write a cookie anyway.
 */
export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) redirect('/login');
  return user;
}

/**
 * Requires a session *and* a profile row. The row is created by a database
 * trigger on sign-up, so a missing one means something went wrong upstream —
 * we send the user through the profile flow rather than 500ing.
 */
export async function requireProfile(): Promise<Profile> {
  await requireUser();
  const profile = await getProfile();
  if (!profile) redirect('/complete-profile');
  if (profile.account_status === 'suspended') redirect('/account-suspended');
  return profile;
}

/**
 * §2 — a mobile number is mandatory before posting a property or unlocking a
 * contact. This is the UX-level gate; the database enforces the same rule
 * independently via `profile_is_complete()`.
 */
export async function requireCompleteProfile(): Promise<Profile> {
  const profile = await requireProfile();
  if (!profile.is_profile_complete) redirect('/complete-profile');
  return profile;
}

/** §16 — admin access is checked on the server, never inferred from the UI. */
export async function requireAdmin(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== 'admin') redirect('/');
  return profile;
}

export async function isAdmin(): Promise<boolean> {
  const profile = await getProfile();
  return profile?.role === 'admin';
}
