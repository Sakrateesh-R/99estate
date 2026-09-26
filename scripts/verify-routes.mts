/**
 * Keeps `KNOWN_TOP_LEVEL` in step with `app/`.
 *
 * Middleware 404s single-segment paths it does not recognise, which makes that
 * set load-bearing: add a route without adding it there and the route starts
 * answering 404 in production, looking like a routing bug rather than a stale
 * list. This runs as part of `npm run check` so the list cannot drift.
 *
 * The reverse direction matters less but is still worth knowing — a name in the
 * set with no route behind it is dead weight, and usually a rename nobody
 * finished.
 *
 *   npm run verify:routes
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { KNOWN_TOP_LEVEL } from '../lib/seo/route-segments.ts';

const APP = join(process.cwd(), 'app');

/** Route groups — `(public)` — are organisational and add no path segment. */
const isGroup = (name: string) => name.startsWith('(') && name.endsWith(')');
/** `[landing]`, `[slug]` — dynamic, and never a literal first segment. */
const isDynamic = (name: string) => name.startsWith('[');
/** `_components` and friends are private folders, not routes. */
const isPrivate = (name: string) => name.startsWith('_') || name.startsWith('.');

function topLevelSegments(dir: string): Set<string> {
  const found = new Set<string>();

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (isPrivate(entry.name) || isDynamic(entry.name)) continue;

    if (isGroup(entry.name)) {
      // A group's children are themselves first segments.
      for (const inner of topLevelSegments(join(dir, entry.name))) found.add(inner);
      continue;
    }

    found.add(entry.name);
  }

  return found;
}

/** Root files that answer on their own path rather than a directory. */
const FILE_ROUTES = new Set(['icon.svg', 'opengraph-image', 'robots.txt', 'sitemap.xml']);

const onDisk = topLevelSegments(APP);
const missing = [...onDisk].filter((s) => !KNOWN_TOP_LEVEL.has(s)).sort();
const stale = [...KNOWN_TOP_LEVEL]
  .filter((s) => !onDisk.has(s) && !FILE_ROUTES.has(s))
  .sort();

console.log(`  ${onDisk.size} route segments on disk, ${KNOWN_TOP_LEVEL.size} in KNOWN_TOP_LEVEL`);

if (missing.length > 0) {
  console.log(`\n  FAIL  these routes exist but middleware would 404 them:`);
  for (const s of missing) console.log(`          /${s}`);
  console.log(`\n  Add them to KNOWN_TOP_LEVEL in lib/seo/routes.ts.`);
}

if (stale.length > 0) {
  console.log(`\n  FAIL  these are in KNOWN_TOP_LEVEL but have no route:`);
  for (const s of stale) console.log(`          /${s}`);
}

if (missing.length === 0 && stale.length === 0) {
  console.log('  PASS  every route is reachable and nothing is listed twice.');
  process.exit(0);
}

process.exit(1);
