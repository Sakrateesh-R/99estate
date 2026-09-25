import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSafeReturnPath } from '@/lib/utils';
import {
  AUTH_ERROR_COOKIE,
  AUTH_ERROR_MAX_AGE,
  DEFAULT_SIGNED_IN_PATH,
  RETURN_TO_COOKIE,
} from '@/lib/constants';

/**
 * OAuth landing route.
 *
 * Google → Supabase → here with `?code=`. That parameter is mandated by the
 * OAuth spec and is not ours to remove; everything we control — the
 * destination and any error message — travels in httpOnly cookies instead of
 * the query string.
 *
 * After exchanging the code we decide where the user actually belongs: a
 * brand-new account has no mobile number yet, and §2 makes that mandatory.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  const code = searchParams.get('code');
  const oauthError = searchParams.get('error_description') ?? searchParams.get('error');

  const failTo = (message: string) => {
    const response = NextResponse.redirect(`${origin}/login`);
    response.cookies.set(AUTH_ERROR_COOKIE, message.slice(0, 300), {
      httpOnly: true,
      sameSite: 'lax',
      secure: origin.startsWith('https:'),
      path: '/',
      maxAge: AUTH_ERROR_MAX_AGE,
    });
    return response;
  };

  if (oauthError) return failTo(oauthError);
  if (!code) return failTo('Sign-in was cancelled.');

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return failTo(error.message);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return failTo('Your session could not be established.');

  // The profile row is created by the `on_auth_user_created` trigger, so it
  // exists by now; what it may lack is a mobile number.
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_profile_complete')
    .eq('id', user.id)
    .maybeSingle();

  const remembered = request.cookies.get(RETURN_TO_COOKIE)?.value;
  const destination = isSafeReturnPath(remembered) ? remembered : DEFAULT_SIGNED_IN_PATH;

  if (!profile?.is_profile_complete) {
    // Keep the return-to cookie: the profile form consumes it once the mobile
    // number is saved, so the user still ends up where they were going.
    return NextResponse.redirect(`${origin}/complete-profile`);
  }

  const response = NextResponse.redirect(`${origin}${destination}`);
  response.cookies.delete(RETURN_TO_COOKIE);
  return response;
}
