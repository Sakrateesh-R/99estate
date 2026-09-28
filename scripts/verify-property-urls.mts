/**
 * Listing URL building and parsing.
 *
 * The URL moved from a 36-character UUID to a 7-character code, and both forms
 * still have to resolve — the old one is already shared and indexed. That makes
 * this the kind of pure string logic worth pinning down with examples, for the
 * same reason as the video and map parsers.
 *
 *   node scripts/verify-property-urls.mts
 *
 * The case rule is the subtle part and gets the most cases: slugs are lowercase
 * and codes are uppercase, which is the only thing standing between
 * `…-for-sale-chennai` and a segment being read as a code.
 */
import { propertyPath, propertyRefFromSlug } from '../lib/utils.ts';

let passed = 0;
const failures: string[] = [];

function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else failures.push(`${label}\n      expected ${e}\n      actual   ${a}`);
}

const UUID = '9b25e91b-3c1f-4297-9fe2-94dc1ab40540';
const CODE = 'K7M2QX4';

// --- building ---------------------------------------------------------------
check(
  'prefers the short code',
  propertyPath({ id: UUID, slug: 'plot-for-sale-kozhikode', public_code: CODE }),
  '/property/plot-for-sale-kozhikode-K7M2QX4',
);
check(
  'falls back to the id when the query forgot to select the code',
  propertyPath({ id: UUID, slug: 'plot-for-sale-kozhikode' }),
  `/property/plot-for-sale-kozhikode-${UUID}`,
);
check('null code falls back too', propertyPath({ id: UUID, slug: 'x', public_code: null }), `/property/x-${UUID}`);
check('no slug, code only', propertyPath({ id: UUID, slug: null, public_code: CODE }), `/property/${CODE}`);

// --- parsing ----------------------------------------------------------------
const REFS: [string, string, unknown][] = [
  ['code with slug', `plot-for-sale-kozhikode-${CODE}`, { kind: 'code', value: CODE }],
  ['bare code', CODE, { kind: 'code', value: CODE }],
  ['uuid with slug', `plot-for-sale-kozhikode-${UUID}`, { kind: 'id', value: UUID }],
  ['bare uuid', UUID, { kind: 'id', value: UUID }],
  ['uppercase uuid is normalised', UUID.toUpperCase(), { kind: 'id', value: UUID }],

  // The reason codes are uppercase. Every one of these is a plausible slug
  // ending, and none may be mistaken for a code.
  ['slug ending in a 7-letter word', 'flat-for-sale-chennai', null],
  ['slug ending in kerala', 'house-for-sale-kerala', null],
  ['slug ending in a 7-char lowercase token', 'plot-in-sulur-abc1234', null],
  ['plain slug', 'residential-plot-for-sale-coimbatore', null],

  // Wrong lengths and excluded letters.
  ['six characters is not a code', 'plot-K7M2QX', null],
  ['eight characters is not a code', 'plot-K7M2QX4Z', null],
  ['I is excluded from the alphabet', 'plot-K7M2QI4', null],
  ['O is excluded', 'plot-K7M2QO4', null],
  ['L is excluded', 'plot-K7M2QL4', null],
  ['U is excluded', 'plot-K7M2QU4', null],

  ['empty', '', null],
];

for (const [label, segment, expected] of REFS) {
  check(`propertyRefFromSlug — ${label}`, propertyRefFromSlug(segment), expected);
}

// --- the round trip ---------------------------------------------------------
// What middleware relies on to decide whether a request is already canonical.
const built = propertyPath({ id: UUID, slug: 'plot-for-sale-kozhikode', public_code: CODE });
check(
  'a built path parses back to the same code',
  propertyRefFromSlug(built.replace('/property/', '')),
  { kind: 'code', value: CODE },
);

console.log(`${failures.length === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failures.length} failed`);
failures.forEach((f) => console.log(`  FAIL  ${f}`));
if (failures.length === 0) console.log('Listing URL building and parsing holds.');
process.exit(failures.length === 0 ? 0 : 1);
