import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { env } from '@/lib/env';
import { isSafeReturnPath, propertyIdFromSlug } from '@/lib/utils';
import { notFoundResponse } from '@/lib/seo/routes';
import {
  DEFAULT_SIGNED_IN_PATH,
  SITE_NAME,
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
  const { pathname, search } = request.nextUrl;

  /**
   * Rescue an OAuth code that landed on the wrong page.
   *
   * Supabase validates `redirect_to` against its Redirect URLs allow-list. If
   * the callback is not listed it silently falls back to the project's Site
   * URL — so the user arrives at `/?code=…` instead of `/auth/callback`, the
   * code is never exchanged, and they appear signed out with a stray
   * parameter in the address bar.
   *
   * Forwarding it fixes the session (the code is valid wherever it lands) and
   * clears the parameter, because the callback route redirects onward once it
   * is spent. The allow-list is still the real fix; this stops a
   * configuration slip from looking like a broken login.
   */
  const oauthCode = request.nextUrl.searchParams.get('code');
  const oauthError = request.nextUrl.searchParams.get('error');

  if ((oauthCode || oauthError) && pathname !== '/auth/callback') {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/callback';
    return NextResponse.redirect(url);
  }

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

  /**
   * §23 — a listing that is gone answers 404, not 200 with a 404 page inside.
   *
   * The path shape is checked earlier without a database; this is the case that
   * needs one — a well-formed listing id that no longer resolves, because the
   * listing was deleted, taken down, paused or expired. Those are precisely the
   * URLs Google has already indexed, so leaving them as soft 404s teaches it
   * that the site answers 200 for pages that are gone.
   *
   * Only for signed-out visitors, which is what makes it safe and cheap:
   *
   *   Safe — a seller opening their own draft, or an admin opening a listing
   *   they took down, must never be told it does not exist. Both are signed in,
   *   and RLS would show them the row anyway. Restricting to anonymous requests
   *   means this can never 404 somebody's own work.
   *
   *   Cheap — a signed-out request has no session to refresh, so `getUser()`
   *   above costs nothing and this is the only round trip. Signed-in browsing,
   *   which is the latency-sensitive case, is untouched.
   *
   * Not cloaking: the same URL is gone for everyone, and Googlebot is an
   * anonymous visitor like any other. The signed-in path differs only in that
   * it still renders the old soft 404, which nobody indexes.
   *
   * RLS decides visibility, so this asks no questions about status itself:
   * `properties_select_published` already hides anything not live.
   */
  if (!user && pathname.startsWith('/property/')) {
    const id = propertyIdFromSlug(pathname.slice('/property/'.length));

    if (id) {
      const { data: listing } = await supabase
        .from('properties')
        .select('id')
        .eq('id', id)
        .maybeSingle();

      if (!listing) return notFoundResponse(SITE_NAME);
    }
  }

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
