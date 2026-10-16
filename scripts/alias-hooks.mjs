/**
 * Teaches bare Node how to resolve the `@/` path alias.
 *
 * The verification suites under `scripts/` run on Node directly rather than
 * through Next, so they get Node's resolver — which knows nothing about the
 * `paths` mapping in tsconfig.json. Until now that limited these suites to
 * modules with no internal imports at all: `lib/properties/map-link.ts` and
 * `lib/properties/video.ts` are testable only because they happen to import
 * nothing.
 *
 * That is a bad reason to decide what can be tested. The alternative was to
 * make a module a leaf on purpose — inlining `normaliseMobile` into the company
 * schema so the schema could be imported — which means duplicating the very
 * logic the suite is meant to pin down.
 *
 * Resolution hooks run in a separate thread from the application, which is why
 * this lives in its own file and is registered by `with-alias.mjs`.
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * `scripts/` sits directly under the project root.
 *
 * Via `fileURLToPath`, not `new URL(...).pathname`: this project lives in a
 * directory with a space in its name, so the raw pathname arrives
 * percent-encoded as `Final%20Pics` and every candidate path built from it
 * misses. On Windows it also carries a leading slash before the drive letter.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * TypeScript resolves `@/lib/format` to a file whose extension is implicit.
 * Node's type stripping needs the real filename, so the candidates are tried in
 * the order TypeScript itself would.
 */
const EXTENSIONS = ['', '.ts', '.tsx', '.mts', '.js', '.mjs', '/index.ts', '/index.tsx'];

export async function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith('@/')) return nextResolve(specifier, context);

  const base = path.join(ROOT, specifier.slice(2));

  for (const extension of EXTENSIONS) {
    const candidate = base + extension;
    if (existsSync(candidate)) {
      return { url: pathToFileURL(candidate).href, shortCircuit: true };
    }
  }

  // Fall through rather than invent a path: a genuinely missing module should
  // fail with Node's own message, naming the specifier that was asked for.
  return nextResolve(specifier, context);
}
