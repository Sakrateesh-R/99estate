import { z } from 'zod';
import { isMapUrl } from '@/lib/properties/map-link';

/**
 * Validation for the project record (§5).
 *
 * Mirrors the CHECK constraints on `projects`. Note what is absent: no
 * verification status, no `is_featured`, no counters. Those are admin-managed
 * or trigger-maintained, the guard trigger reverts them, and a form that
 * offered them would be offering something the database will not accept.
 */

const PROJECT_TYPES = [
  'apartment',
  'villa',
  'independent_house',
  'plot',
  'commercial',
  'mixed_development',
] as const;

const PROJECT_STATUSES = [
  'upcoming',
  'pre_launch',
  'new_launch',
  'under_construction',
  'near_completion',
  'ready_to_move',
  'completed',
  'sold_out',
] as const;

const AREA_UNITS = [
  'sqft',
  'sqm',
  'sqyd',
  'acre',
  'hectare',
  'cent',
  'guntha',
  'bigha',
  'marla',
  'kanal',
] as const;

/** `''` from a blank input and `null` from a database row both mean absent. */
function optionalText(max: number, message?: string) {
  return z.preprocess(
    (v) => (v === null || (typeof v === 'string' && v.trim() === '') ? undefined : v),
    z.string().trim().max(max, message ?? `Keep this under ${max} characters`).optional(),
  );
}

function optionalNumber(min: number, max: number, message: string) {
  return z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
    z.number({ invalid_type_error: message }).min(min, message).max(max, message).optional(),
  );
}

/** A `<input type="date">` submits `''` when cleared, which must not become Invalid Date. */
function optionalDate(message: string) {
  return z.preprocess(
    (v) => (v === null || (typeof v === 'string' && v.trim() === '') ? undefined : v),
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, message)
      .optional(),
  );
}

/**
 * The fields, before the cross-field rules are layered on.
 *
 * Exported separately because `.refine()` returns a wrapper, and the object's
 * `shape` is then only reachable by digging through `_def`. Anything that wants
 * to enumerate the field names — the verification suite does, to check every
 * one has an input in the form — should read this instead of the internals.
 */
export const projectFields = z.object({
  organization_id: z.string().uuid('Choose which company this project belongs to'),

  name: z
    .string()
    .trim()
    .min(3, 'Give the project a name')
    .max(150, 'That project name is too long'),

  project_type: z.enum(PROJECT_TYPES, {
    errorMap: () => ({ message: 'Choose what kind of project this is' }),
  }),

  status: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? 'upcoming' : v),
    z.enum(PROJECT_STATUSES, {
      errorMap: () => ({ message: 'Choose where construction has got to' }),
    }),
  ),

  /** The builder's own reference, unique inside the company. */
  project_code: optionalText(40, 'Keep the project code under 40 characters'),
  description: optionalText(12000, 'Keep the description under 12,000 characters'),

  city: z.string().trim().min(2, 'Enter the city').max(80, 'City name is too long'),
  locality: optionalText(120),
  district: optionalText(80),
  state: optionalText(80),
  address: optionalText(500),

  pincode: z.preprocess(
    (v) => (v === null || (typeof v === 'string' && v.trim() === '') ? undefined : v),
    z
      .string()
      .trim()
      .regex(/^[1-9][0-9]{5}$/, 'Enter a valid 6-digit PIN code')
      .optional(),
  ),

  /**
   * Same division of labour as a listing's map link: this checks it is a
   * Google Maps URL, and the CHECK constraint pins scheme, host and length.
   * Whether coordinates can be read out of it is a separate question that
   * does not block saving the project.
   */
  map_url: z.preprocess(
    (v) => (v === null || (typeof v === 'string' && v.trim() === '') ? undefined : v),
    z
      .string()
      .trim()
      .max(2048, 'That link is too long')
      .refine(isMapUrl, 'Paste a Google Maps link — use Share in Maps, then Copy link')
      .optional(),
  ),

  total_area: optionalNumber(0.01, 999_999_999, 'Enter a valid total area'),
  total_area_unit: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? 'acre' : v),
    z.enum(AREA_UNITS),
  ),

  /**
   * Declared from the brochure, and deliberately not the same thing as the
   * inventory count: a builder announces 120 apartments long before 120 unit
   * rows exist, and the project page has to be able to say so.
   */
  total_units: optionalNumber(0, 100_000, 'Enter a valid number of units'),

  price_min: optionalNumber(1, 9_999_999_999_999, 'Enter a valid starting price'),
  price_max: optionalNumber(1, 9_999_999_999_999, 'Enter a valid top price'),

  /**
   * §26 — "2 & 3 BHK Apartments". A checkbox group, so the action reads it
   * with `getAll`; an empty array is legitimate for a plot layout.
   */
  bedroom_options: z.preprocess(
    (v) => (Array.isArray(v) ? v.map(Number).filter((n) => Number.isInteger(n)) : []),
    z.array(z.number().int().min(0).max(50)).max(12),
  ),

  launch_date: optionalDate('Enter the launch date as a date'),
  expected_completion_date: optionalDate('Enter the expected completion date as a date'),

  construction_progress_percentage: optionalNumber(0, 100, 'Progress must be between 0 and 100'),
  construction_progress_note: optionalText(1000, 'Keep the progress note under 1,000 characters'),

  rera_number: optionalText(60, 'That RERA number is too long'),
});

/**
 * The field rules plus the two that compare fields against each other.
 */
export const projectSchema = projectFields
  .refine((v) => v.price_min == null || v.price_max == null || v.price_max >= v.price_min, {
    message: 'The top price cannot be lower than the starting price',
    path: ['price_max'],
  })
  /**
   * Not a database constraint, just arithmetic nobody means: a project that
   * completes before it launches is a typo, and silently storing it would put
   * two contradictory dates on the public page.
   */
  .refine(
    (v) =>
      !v.launch_date ||
      !v.expected_completion_date ||
      v.expected_completion_date >= v.launch_date,
    {
      message: 'Completion cannot be earlier than the launch date',
      path: ['expected_completion_date'],
    },
  );

export type ProjectInput = z.input<typeof projectSchema>;
export type ProjectValues = z.output<typeof projectSchema>;
export type ProjectFieldName = keyof ProjectValues;
