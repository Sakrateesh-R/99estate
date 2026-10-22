/**
 * §16 — the hook that makes a server-side 500 visible.
 *
 * `onRequestError` is Next's one place that sees *every* server-side failure:
 * a Server Component render, a Route Handler, and — the case that mattered —
 * a Server Action. It fires after the response has already been decided, so
 * nothing here can change what the user gets; it only decides whether we find
 * out. See `lib/diagnostics/server-errors.ts` for what gets recorded and why.
 *
 * This file is additive. No existing module imports it and it imports no
 * application code at module scope, so a mistake in here cannot break a
 * request path — the worst it can do is fail to log.
 */
import type { Instrumentation } from 'next';

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  /**
   * Node runtime only.
   *
   * Middleware runs on the Edge runtime, and pulling the Supabase client into
   * that bundle to catch a rarer class of error would mean this diagnostic
   * could break the middleware build — i.e. break every request to protect
   * the logging of a few. Edge failures stay in the platform log.
   */
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  /**
   * Imported dynamically so the reporter — and the service-role client it
   * uses — is loaded only when something has actually gone wrong, and never
   * ends up in a bundle that does not need it.
   */
  const { reportServerError } = await import('@/lib/diagnostics/server-errors');

  await reportServerError(error, request, context);
};
