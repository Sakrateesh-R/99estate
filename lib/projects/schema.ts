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
  /**
   * Optional in the form, never optional in the row.
   *
   * `projects.organization_id` is NOT NULL and always will be — every project
   * policy resolves the caller's rights through it. But a builder adding their
   * first project has no company to choose, and asking them to register one
   * first was a form in front of a form. So the field is only sent when there
   * is a genuine choice to make, and `createProject` fills it in otherwise via
   * `ensureProjectWorkspace()`.
   *
   * An empty string becomes undefined rather than failing: that is what an
   * absent `<select>` submits, and it means "you pick" rather than "invalid".
   */
  organization_id: z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    z.string().uuid('Choose which company this project belongs to').optional(),
  ),

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

// ---------------------------------------------------------------------------
// Project media (§9)
// ---------------------------------------------------------------------------

/**
 * Mirrors `project_media_enforce_limit()`, whose own limit comes from
 * `setting_int('max_media_per_project', 40)`.
 *
 * Duplicated here for the same reason the property limits are: the database is
 * the authority, but a row rejected there arrives as an opaque 23514 and the
 * uploader needs to say "you already have 40" before spending a builder's
 * bandwidth on the 41st.
 */
export const MAX_MEDIA_PER_PROJECT = 40;

/** Matches the `project-media` bucket's `allowed_mime_types`, minus the PDF. */
export const PROJECT_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
] as const;

/** The bucket's `file_size_limit`. */
export const MAX_PROJECT_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * The media types this UI writes.
 *
 * The enum in the database is wider — `floor_plan`, `master_plan`, `brochure`,
 * `construction_update` all exist and are read by the public page — but
 * nothing writes them yet, so listing them here would imply a tool that is not
 * built.
 *
 * `cover` is not a separate upload: it is a gallery row promoted, because
 * `project_media_sync_cover_url()` picks the cover by `type = 'cover'` and
 * falls back to the first gallery image by sort order.
 */
export const PROJECT_GALLERY_TYPES = ['cover', 'gallery'] as const;

/**
 * The plan types, which the public page already renders as its "Plans"
 * section — `floor_plan` and `master_plan` together, master first.
 *
 * `brochure` is in the database enum and is deliberately not here: nothing
 * renders it, so offering an upload would store a PDF no buyer can ever reach.
 * It also cannot go through `optimiseImage`, which is for bitmaps.
 */
export const PROJECT_PLAN_TYPES = ['floor_plan', 'master_plan'] as const;
export type ProjectPlanType = (typeof PROJECT_PLAN_TYPES)[number];

/** Every type this UI is allowed to write, gallery and plans together. */
export const PROJECT_UPLOAD_TYPES = ['gallery', 'floor_plan', 'master_plan'] as const;
export type ProjectUploadType = (typeof PROJECT_UPLOAD_TYPES)[number];

/** `project_media_title_check` caps it at 150. */
export const MAX_PROJECT_MEDIA_TITLE = 150;

export const PROJECT_PLAN_TYPE_LABELS: Record<ProjectPlanType, string> = {
  floor_plan: 'Floor plan',
  master_plan: 'Master plan',
};

/**
 * §10 — the amenity list for a project.
 *
 * Same shape and same limits as `amenitiesSchema` for a listing, because
 * `project_amenities` is a copy of `property_amenities` down to the name
 * length check — and the vocabulary behind both is the one shared `amenities`
 * table, so the two must agree about what a valid name is.
 */
export const projectAmenitiesSchema = z.object({
  amenities: z.array(z.string().trim().min(2).max(60)).max(80),
});
