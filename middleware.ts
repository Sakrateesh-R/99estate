import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
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
