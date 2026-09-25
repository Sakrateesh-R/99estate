import { cookies } from 'next/headers';
import {
  AUTH_ERROR_COOKIE,
  AUTH_ERROR_MAX_AGE,
  DEFAULT_SIGNED_IN_PATH,
  RETURN_TO_COOKIE,
  RETURN_TO_MAX_AGE,
} from '@/lib/constants';
import { isSafeReturnPath } from '@/lib/utils';

/**
 * Server-side access to the "where was this user heading" cookie.
 *
 * This replaces `?next=` on the URL. Keeping the destination out of the query
 * string means the address bar stays clean, the value cannot be hand-edited
 * into an open redirect, and nothing about the user's intent is exposed in
 * browser history, server logs or a Referer header.
 *
 * `set` and `delete` only work in a Server Action or Route Handler — a Server
 * Component cannot mutate cookies — hence the try/catch in the consumers.
 */

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

export async function readReturnTo(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(RETURN_TO_COOKIE)?.value;
  return isSafeReturnPath(value) ? value : null;
}

/** Reads the destination and clears it, so a stale value cannot fire twice. */
export async function consumeReturnTo(fallback: string = DEFAULT_SIGNED_IN_PATH): Promise<string> {
  const store = await cookies();
  const value = store.get(RETURN_TO_COOKIE)?.value;

  try {
    store.delete(RETURN_TO_COOKIE);
  } catch {
    // Server Component context — the cookie expires on its own.
  }

  return isSafeReturnPath(value) ? value : fallback;
}

export async function rememberReturnToPath(path: string): Promise<void> {
  if (!isSafeReturnPath(path)) return;
  const store = await cookies();
  try {
    store.set(RETURN_TO_COOKIE, path, { ...COOKIE_OPTIONS, maxAge: RETURN_TO_MAX_AGE });
  } catch {
    // Not mutable here; the caller is a Server Component.
  }
}

// ---------------------------------------------------------------------------
// Sign-in errors — previously `?error=<message>` on the login URL.
// ---------------------------------------------------------------------------

export async function readAuthError(): Promise<string | null> {
  const store = await cookies();
  return store.get(AUTH_ERROR_COOKIE)?.value ?? null;
}

export async function setAuthError(message: string): Promise<void> {
  const store = await cookies();
  try {
    store.set(AUTH_ERROR_COOKIE, message.slice(0, 300), {
      ...COOKIE_OPTIONS,
      maxAge: AUTH_ERROR_MAX_AGE,
    });
  } catch {
    // Server Component context.
  }
}

export async function clearAuthError(): Promise<void> {
  const store = await cookies();
  try {
    store.delete(AUTH_ERROR_COOKIE);
  } catch {
    // Server Component context — it expires within a minute anyway.
  }
}
