/**
 * The company and project forms, and the schemas behind them.
 *
 *   node scripts/verify-builder-forms.mts
 *
 * Two different things are checked here, and the second is the reason this file
 * exists at all.
 *
 * First the ordinary one: that each schema accepts what a person would type and
 * rejects what the database would refuse. The CHECK constraints are the real
 * defence, so the value of this half is error messages — a builder who typed
 * `abcbuilders.in` should be helped, not handed a constraint violation.
 *
 * Second, and less obvious: that the `name` attributes in the form components
 * match the keys the Server Actions read. TypeScript cannot see that
 * relationship — a `<input name="price_minimum">` against a
 * `formData.get('price_min')` typechecks perfectly and silently drops the
 * field on every save. There is no type to connect a string literal in JSX to
 * a string literal in an action, so it gets connected here.
 */
import { readFileSync } from 'node:fs';
import type { z, ZodTypeAny } from 'zod';
import { organizationSchema } from '../lib/organizations/schema.ts';
import { projectFields, projectSchema } from '../lib/projects/schema.ts';

let passed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean, detail = '') {
  if (condition) passed++;
  else failures.push(`${label}${detail ? `\n      ${detail}` : ''}`);
}

/** Asserts the schema accepts the input, and reports why when it does not. */
function accepts<T extends ZodTypeAny>(label: string, schema: T, input: unknown): z.output<T> | null {
  const result = schema.safeParse(input);
  check(
    label,
    result.success,
    result.success
      ? ''
      : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
  );
  return result.success ? result.data : null;
}

/** Asserts the schema rejects the input, and that it blames the right field. */
function rejects(label: string, schema: ZodTypeAny, input: unknown, expectedPath?: string) {
  const result = schema.safeParse(input);
  if (result.success) {
    failures.push(`${label}\n      INPUT WAS ACCEPTED`);
    return;
  }
  if (expectedPath) {
    const paths = result.error.issues.map((i) => i.path.join('.'));
    check(label, paths.includes(expectedPath), `blamed ${paths.join(', ')} instead of ${expectedPath}`);
    return;
  }
  passed++;
}

// ---------------------------------------------------------------------------
// The company form
// ---------------------------------------------------------------------------
const MINIMAL_ORG = { name: 'ABC Builders', org_types: ['builder'] };

accepts('a company needs only a name and one type', organizationSchema, MINIMAL_ORG);

// What an untouched form actually submits: every optional box is ''.
accepts('blank optional fields are absent, not invalid', organizationSchema, {
  ...MINIMAL_ORG,
  about: '',
  established_year: '',
  phone: '',
  email: '',
  website: '',
  office_address: '',
  locality: '',
  city: '',
  state: '',
  pincode: '',
  gst_number: '',
  rera_number: '',
});

// A row read back out of the database, where an empty column is null rather
// than ''. The listing schema had exactly this bug: null fell through to
// `z.string().optional()`, which rejects it, and nobody who left a field blank
// could save again.
accepts('null from a database row is absent too', organizationSchema, {
  ...MINIMAL_ORG,
  about: null,
  established_year: null,
  phone: null,
  website: null,
  pincode: null,
  city: null,
});

rejects('a company must say what it does', organizationSchema, { ...MINIMAL_ORG, org_types: [] }, 'org_types');
rejects('a one-character name is refused', organizationSchema, { ...MINIMAL_ORG, name: 'A' }, 'name');
rejects('an unknown company type is refused', organizationSchema, { ...MINIMAL_ORG, org_types: ['landlord'] }, 'org_types.0');

// Several types at once is the whole reason the column is an array.
const multi = accepts('a company can be three things at once', organizationSchema, {
  ...MINIMAL_ORG,
  org_types: ['builder', 'developer', 'promoter'],
});
check('all three types survive', multi?.org_types.length === 3, JSON.stringify(multi?.org_types));

// The convenience that keeps a constraint violation off the screen.
const bare = accepts('a website without a scheme is accepted', organizationSchema, {
  ...MINIMAL_ORG,
  website: 'abcbuilders.in',
});
check(
  'and https:// is added, because the CHECK requires a scheme',
  bare?.website === 'https://abcbuilders.in',
  String(bare?.website),
);
const kept = accepts('an existing scheme is left alone', organizationSchema, {
  ...MINIMAL_ORG,
  website: 'http://abcbuilders.in',
});
check('http stays http', kept?.website === 'http://abcbuilders.in', String(kept?.website));
rejects('a bare word is not a website', organizationSchema, { ...MINIMAL_ORG, website: 'abcbuilders' }, 'website');

// Matches profiles.mobile_number so the two render identically.
const phone = accepts('a phone number typed with +91 and spaces', organizationSchema, {
  ...MINIMAL_ORG,
  phone: '+91 98765 43210',
});
check('normalised to ten bare digits', phone?.phone === '9876543210', String(phone?.phone));
rejects('a landline is refused', organizationSchema, { ...MINIMAL_ORG, phone: '04324 255555' }, 'phone');
rejects('a number starting below 6 is refused', organizationSchema, { ...MINIMAL_ORG, phone: '5876543210' }, 'phone');

rejects('a four-digit PIN is refused', organizationSchema, { ...MINIMAL_ORG, pincode: '6390' }, 'pincode');
rejects('a PIN starting with zero is refused', organizationSchema, { ...MINIMAL_ORG, pincode: '063900' }, 'pincode');
rejects('a year in the future is refused', organizationSchema, {
  ...MINIMAL_ORG,
  established_year: String(new Date().getFullYear() + 1),
}, 'established_year');
rejects('a year before 1800 is refused', organizationSchema, { ...MINIMAL_ORG, established_year: '1799' }, 'established_year');

// ---------------------------------------------------------------------------
// The project form
// ---------------------------------------------------------------------------
const ORG_ID = '9b25e91b-3c1f-4297-9fe2-94dc1ab40540';
const MINIMAL_PROJECT = {
  organization_id: ORG_ID,
  name: 'Green Valley',
  project_type: 'plot',
  city: 'Karur',
  bedroom_options: [],
  total_area_unit: '',
  status: '',
};

const minimal = accepts('a project needs a company, a name, a type and a city', projectSchema, MINIMAL_PROJECT);
check('status defaults to upcoming', minimal?.status === 'upcoming', String(minimal?.status));
check('site area defaults to acres', minimal?.total_area_unit === 'acre', String(minimal?.total_area_unit));

/**
 * The company is no longer the form's problem.
 *
 * A project still cannot exist without one — `projects.organization_id` is NOT
 * NULL and every project policy resolves rights through it — but a builder
 * adding their first project is not asked to register a company first, so the
 * field arrives blank and `createProject` fills it in through
 * `ensureProjectWorkspace()`. Blank therefore means "you choose", not
 * "invalid", and this used to assert the opposite.
 *
 * Both halves are checked, because only the first one changed: a blank is
 * waved through, and anything present but malformed is still refused — that is
 * what stops a tampered field deciding which company's permissions apply.
 */
const noCompany = accepts(
  'a project with no company is accepted, to be resolved server-side',
  projectSchema,
  { ...MINIMAL_PROJECT, organization_id: '' },
);
check(
  'a blank company becomes undefined rather than an empty string',
  noCompany?.organization_id === undefined,
  String(noCompany?.organization_id),
);
rejects(
  'a company id that is not a uuid is still refused',
  projectSchema,
  { ...MINIMAL_PROJECT, organization_id: 'not-a-uuid' },
  'organization_id',
);
rejects('a two-character name is refused', projectSchema, { ...MINIMAL_PROJECT, name: 'GV' }, 'name');
rejects('a project type outside the enum is refused', projectSchema, { ...MINIMAL_PROJECT, project_type: 'township' }, 'project_type');
rejects('a city is required', projectSchema, { ...MINIMAL_PROJECT, city: '' }, 'city');

// projects_price_range_check, caught here so the message names price_max.
rejects('a top price below the starting price is refused', projectSchema, {
  ...MINIMAL_PROJECT,
  price_min: '8200000',
  price_max: '5500000',
}, 'price_max');
accepts('an equal range is fine — one price, stated twice', projectSchema, {
  ...MINIMAL_PROJECT,
  price_min: '5500000',
  price_max: '5500000',
});
accepts('a starting price with no top price is fine', projectSchema, { ...MINIMAL_PROJECT, price_min: '5500000' });

// Not a database constraint; just arithmetic nobody means.
rejects('completing before launching is refused', projectSchema, {
  ...MINIMAL_PROJECT,
  launch_date: '2026-06-01',
  expected_completion_date: '2025-06-01',
}, 'expected_completion_date');
accepts('completing after launching is fine', projectSchema, {
  ...MINIMAL_PROJECT,
  launch_date: '2026-06-01',
  expected_completion_date: '2028-12-01',
});
accepts('a cleared date input is absent, not Invalid Date', projectSchema, {
  ...MINIMAL_PROJECT,
  launch_date: '',
  expected_completion_date: '',
});

rejects('progress above 100% is refused', projectSchema, {
  ...MINIMAL_PROJECT,
  construction_progress_percentage: '120',
}, 'construction_progress_percentage');
accepts('zero progress is a real answer', projectSchema, {
  ...MINIMAL_PROJECT,
  construction_progress_percentage: '0',
});

// The checkbox group arrives as strings and has to land as numbers, because the
// column is smallint[].
const bhk = accepts('BHK checkboxes become numbers', projectSchema, {
  ...MINIMAL_PROJECT,
  bedroom_options: ['2', '3'],
});
check('stored as [2, 3]', JSON.stringify(bhk?.bedroom_options) === '[2,3]', JSON.stringify(bhk?.bedroom_options));

// Same allowlist as a listing's map link, because the value is shown the same way.
rejects('a non-Maps link is refused', projectSchema, { ...MINIMAL_PROJECT, map_url: 'https://evil.com/x' }, 'map_url');
accepts('a Maps share link is accepted', projectSchema, {
  ...MINIMAL_PROJECT,
  map_url: 'https://maps.app.goo.gl/abcdef',
});

// ---------------------------------------------------------------------------
// The forms and the actions agree about field names
// ---------------------------------------------------------------------------
/**
 * Pulls every `name="..."` out of a component, ignoring the ones that are not
 * schema fields: `organization_id` and `project_id` are routing values the
 * actions read separately, and `org_types` / `bedroom_options` are read with
 * `getAll`.
 */
function formFieldNames(...paths: string[]): Set<string> {
  const names = new Set<string>();
  for (const path of paths) {
    const source = readFileSync(path, 'utf8');
    for (const match of source.matchAll(/\bname="([a-z_]+)"/g)) names.add(match[1]);
    /**
     * Not every field is an `<input name=…>`. The team panel builds a FormData
     * by hand for its row actions — a role change is a `<select>` with an
     * `onChange`, and removing somebody is a button, neither of which is a form
     * field. Those keys are just as capable of drifting from what the action
     * reads, so they are collected too.
     */
    for (const match of source.matchAll(/formData\.set\('([a-z_]+)'/g)) names.add(match[1]);
  }
  return names;
}

/** Pulls every key the action reads out of the submitted FormData. */
function actionFieldNames(path: string): Set<string> {
  const source = readFileSync(path, 'utf8');
  const names = new Set<string>();
  for (const match of source.matchAll(/formData\.get(?:All)?\('([a-z_]+)'\)/g)) names.add(match[1]);
  return names;
}

/**
 * Two components write to the organizations action: the company profile form,
 * and the team panel. The cross-check only means something if it knows about
 * both — pointed at one, it reported the other's fields as unread.
 */
const ORG_FORM = formFieldNames(
  'components/dashboard/organization-form.tsx',
  'components/dashboard/team-manager.tsx',
);
const ORG_ACTION = actionFieldNames('lib/organizations/actions.ts');
const PROJECT_FORM = formFieldNames('components/dashboard/project-form.tsx');
const PROJECT_ACTION = actionFieldNames('lib/projects/actions.ts');

check('the company form renders some fields', ORG_FORM.size > 5, `found ${ORG_FORM.size}`);
check('the project form renders some fields', PROJECT_FORM.size > 10, `found ${PROJECT_FORM.size}`);

for (const field of ORG_FORM) {
  check(
    `company form field "${field}" is read by the action`,
    ORG_ACTION.has(field),
    `the form submits it, nothing reads it — it would be silently dropped`,
  );
}
for (const field of PROJECT_FORM) {
  check(
    `project form field "${field}" is read by the action`,
    PROJECT_ACTION.has(field),
    `the form submits it, nothing reads it — it would be silently dropped`,
  );
}

/**
 * And the other direction: a key the action reads that no input submits is a
 * field that can never be set. `organization_id` and `project_id` are exempt —
 * they are hidden routing values, present in the form by design.
 */
const ORG_EXEMPT = new Set(['organization_id']);
for (const field of ORG_ACTION) {
  if (ORG_EXEMPT.has(field)) continue;
  check(`the company action reads "${field}", which the form submits`, ORG_FORM.has(field));
}
const PROJECT_EXEMPT = new Set(['project_id', 'published']);
for (const field of PROJECT_ACTION) {
  if (PROJECT_EXEMPT.has(field)) continue;
  check(`the project action reads "${field}", which the form submits`, PROJECT_FORM.has(field));
}

/**
 * Every schema key should be reachable from the form. This is what would have
 * caught a field added to the schema and the action but never given an input —
 * a rule nobody can satisfy.
 */
for (const key of Object.keys(organizationSchema.shape)) {
  check(`the company schema key "${key}" has an input`, ORG_FORM.has(key));
}

/**
 * The invite form is validated by its own schema inside the action rather than
 * an exported one, so its two fields are named here instead of enumerated.
 */
for (const key of ['email', 'role']) {
  check(`the invite form submits "${key}"`, ORG_FORM.has(key));
  check(`the company action reads "${key}"`, ORG_ACTION.has(key));
}
for (const key of Object.keys(projectFields.shape)) {
  if (key === 'organization_id') continue; // hidden when there is only one company
  check(`the project schema key "${key}" has an input`, PROJECT_FORM.has(key));
}

console.log(`${failures.length === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failures.length} failed`);
failures.forEach((f) => console.log(`  FAIL  ${f}`));
if (failures.length === 0) console.log('Builder forms and their schemas agree.');
process.exit(failures.length === 0 ? 0 : 1);
