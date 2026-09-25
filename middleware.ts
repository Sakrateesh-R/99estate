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
     */
    '/((?!_next/static|_next/image|api/webhooks|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?)$).*)',
  ],
};
