'use server';

import { rememberReturnToPath } from '@/lib/auth/return-to';

/**
 * Lets a Client Component record where the user was before sending them to
 * sign in, without putting that path in the URL.
 *
 * A Client Component cannot write an httpOnly cookie, and a Server Component
 * cannot write cookies at all — a Server Action is the one context that can,
 * which is why this thin wrapper exists.
 *
 * Unsafe paths are dropped by `rememberReturnToPath`, so a tampered call is a
 * no-op rather than an open redirect.
 */
export async function rememberReturnTo(path: string): Promise<void> {
  await rememberReturnToPath(path);
}
