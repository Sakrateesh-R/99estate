/**
 * Every first path segment the app actually serves.
 *
 * In its own module, with no imports, for two reasons. Middleware 404s
 * single-segment paths it does not recognise, so this set is load-bearing: a
 * route missing from it starts answering 404 in production and looks like a
 * routing bug. And `scripts/verify-routes.mts` compares it against `app/` on
 * every `npm run check`, which it can only do if the file imports nothing —
 * Node cannot resolve the `@/` alias that the rest of the codebase uses.
 *
 * Add a top-level route, add it here. The check will tell you if you forget.
 */
export const KNOWN_TOP_LEVEL: ReadonlySet<string> = new Set([
  'about',
  'account-suspended',
  'admin',
  'api',
  'auth',
  'complete-profile',
  'dashboard',
  'how-it-works',
  'login',
  'notifications',
  'pricing',
  'privacy',
  'properties',
  'property',
  'saved',
  'terms',
  // Root-level files that answer on a path of their own.
  'icon.svg',
  'opengraph-image',
  'robots.txt',
  'sitemap.xml',
]);
