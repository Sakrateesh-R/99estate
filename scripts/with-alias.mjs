/**
 * Registers the `@/` resolver, for suites that import application modules.
 *
 *   node --import ./scripts/with-alias.mjs scripts/verify-builder-forms.mts
 *
 * Separate from `alias-hooks.mjs` because resolution hooks run on their own
 * thread and have to be loadable independently of the process that registers
 * them.
 */
import { register } from 'node:module';

register('./alias-hooks.mjs', import.meta.url);
