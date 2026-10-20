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

  /**
   * §3 — take up any seat waiting for this address.
   *
   * This is the whole mechanism behind invitations. There is no mailer in this
   * project, so a colleague is not sent a link: an owner records their email,
   * and the invitation becomes a membership the first time they sign in. Doing
   * it here rather than on the dashboard means they are already a member by the
   * time any page renders, so nothing has to handle the half-state.
   *
   * Deliberately not allowed to break sign-in. A failure here means somebody
   * joins a moment later — the dashboard offers any still-pending invitation —
   * whereas failing the callback would lock them out of their own account.
   */
  const { error: inviteError } = await supabase.rpc('accept_pending_invitations');
  if (inviteError) {
    console.error('[auth] accept_pending_invitations failed', {
      code: inviteError.code,
      message: inviteError.message,
    });
  }

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
