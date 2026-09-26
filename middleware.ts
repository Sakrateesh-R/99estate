import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { isDefinitelyNotFound, notFoundHtml } from '@/lib/seo/routes';
import { SITE_NAME } from '@/lib/constants';

export async function middleware(request: NextRequest) {
  /**
   * §23 — the 404, decided here because it cannot be decided later.
   *
   * The `(public)` layout streams its header behind Suspense, so the 200 is sent
   * before the page component runs and `notFound()` can only change the body,
   * not the status. Measured: `/no-such-page` answered 200 with a 404 page
   * inside it, on production as well as locally. Google treats that as a soft
   * 404 — a quality signal about the site, not a missing page.
   *
   * First, before the Supabase round trip in `updateSession`: a scanner probing
   * for `/wp-login.php` should not cost an auth call, and nothing about the
   * decision needs a session.
   *
   * `isDefinitelyNotFound` only answers true when a path provably has nothing
   * behind it. Anything uncertain renders as before — a false 404 on a real page
   * would be a worse bug than the one this fixes.
   */
  if (isDefinitelyNotFound(request.nextUrl.pathname)) {
    return new NextResponse(notFoundHtml(SITE_NAME), {
      status: 404,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        // Belt and braces with the meta tag: a crawler that reads only headers
        // still learns not to index this.
        'x-robots-tag': 'noindex, nofollow',
        // A 404 is cheap to recompute and must not be cached as though the URL
        // were permanently dead — the path may become a real landing page the
        // moment somebody lists a property there.
        'cache-control': 'no-store',
      },
    });
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except:
     *   - Next.js internals and prefetches
     *   - static asset extensions
     *   - /api/webhooks/* — gateway callbacks carry a signature, not a cookie,
     *     and must not be delayed by a token refresh round-trip
     *   - /api/cron/*     — the scheduler presents a bearer token, also not a
     *     cookie, and there is no session to refresh at 00:00
     */
    '/((?!_next/static|_next/image|api/webhooks|api/cron|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?)$).*)',
  ],
};
