import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { env } from '@/lib/env';
import { isSafeReturnPath } from '@/lib/utils';
import {
  DEFAULT_SIGNED_IN_PATH,
  RETURN_TO_COOKIE,
  RETURN_TO_MAX_AGE,
} from '@/lib/constants';
import type { Database } from '@/types/database.types';

/** Routes that require a signed-in user. Prefix match. */
const PROTECTED_PREFIXES = ['/dashboard', '/admin', '/saved', '/complete-profile', '/notifications'];

/** Routes a signed-in user should be bounced away from. */
const GUEST_ONLY_PREFIXES = ['/login'];

function matchesPrefix(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Refreshes the Supabase auth cookies on every request and performs coarse
 * route protection.
 *
 * Deliberately coarse: this only answers "is there a session?". Authorisation
 * proper (is this user an admin, has this user completed their profile, may
 * this user see this lead) belongs to RLS and to the server actions, both of
 * which run even when middleware is bypassed.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // IMPORTANT: getUser() revalidates the JWT against the auth server. Do not
  // swap it for getSession(), which trusts whatever is in the cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;

  if (!user && matchesPrefix(pathname, PROTECTED_PREFIXES)) {
    // Remember the destination in a cookie rather than a `?next=` parameter,
    // so the sign-in URL stays clean and the value cannot be hand-edited.
    const redirect = NextResponse.redirect(new URL('/login', request.url));
    redirect.cookies.set(RETURN_TO_COOKIE, `${pathname}${search}`, {
      httpOnly: true,
      sameSite: 'lax',
      secure: request.nextUrl.protocol === 'https:',
      path: '/',
      maxAge: RETURN_TO_MAX_AGE,
    });
    return redirect;
  }

  if (user && matchesPrefix(pathname, GUEST_ONLY_PREFIXES)) {
    const remembered = request.cookies.get(RETURN_TO_COOKIE)?.value;
    const destination = isSafeReturnPath(remembered) ? remembered : DEFAULT_SIGNED_IN_PATH;

    const redirect = NextResponse.redirect(new URL(destination, request.url));
    redirect.cookies.delete(RETURN_TO_COOKIE);
    return redirect;
  }

  return response;
}
