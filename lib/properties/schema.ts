import { z } from 'zod';
import { parseVideoUrl } from '@/lib/properties/video';

/**
 * Validation for the property posting form (§12).
 *
 * One schema, used by both the wizard and the Server Action. The database
 * repeats every one of these rules as a CHECK constraint — this layer exists
 * to produce good error messages, not to be the last line of defence.
 */

const PROPERTY_TYPES = [
  'apartment',
  'independent_house',
  'villa',
  'builder_floor',
  'penthouse',
  'studio',
  'farmhouse',
  'residential_plot',
  'office_space',
  'co_working',
  'shop',
  'showroom',
  'warehouse',
  'industrial_land',
  'commercial_plot',
  'pg_hostel',
  'agricultural_land',
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

const FACINGS = [
  'north',
  'south',
  'east',
  'west',
  'north_east',
  'north_west',
  'south_east',
  'south_west',
] as const;

/**
 * Empty strings are what an untouched `<input>` submits. Treating them as
 * `undefined` keeps "not filled in" distinct from "filled in with zero" —
 * 0 bathrooms is a real answer, "" is not.
 */
function optionalNumber(min: number, max: number, message: string) {
  return z.preprocess(
    (value) => (value === '' || value === null || value === undefined ? undefined : Number(value)),
    z.number({ invalid_type_error: message }).min(min, message).max(max, message).optional(),
  );
}

function optionalText(max: number) {
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().max(max).optional(),
  );
}

function optionalEnum<T extends readonly [string, ...string[]]>(values: T) {
  return z.preprocess(
    (value) => (value === '' || value === null ? undefined : value),
    z.enum(values).optional(),
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Basic information
// ---------------------------------------------------------------------------
export const basicInfoSchema = z.object({
  listing_type: z.enum(['sale', 'rent', 'pg'], {
    errorMap: () => ({ message: 'Choose whether this is for sale, for rent or a PG' }),
  }),
  /**
   * Declared per listing, not taken from the account role — the same person is
   * genuinely an owner on their own flat and a broker on a client's. Buyers
   * filter on this, so it has to describe the listing.
   */
  seller_type: z.enum(['owner', 'agent', 'builder'], {
    errorMap: () => ({ message: 'Tell buyers whether you are the owner or a broker' }),
  }),
  property_type: z.enum(PROPERTY_TYPES, {
    errorMap: () => ({ message: 'Choose a property type' }),
  }),
  title: z
    .string()
    .trim()
    .min(8, 'Give your listing a descriptive title (at least 8 characters)')
    .max(150, 'Keep the title under 150 characters'),
  price: z.preprocess(
    (v) => (v === '' || v == null ? undefined : Number(v)),
    z
      .number({ invalid_type_error: 'Enter the price in rupees' })
      .positive('Price must be more than zero')
      .max(9_999_999_999_999, 'That price looks too large'),
  ),
  // NOT z.coerce.boolean(): that maps the string "false" to `true`, which is
  // exactly what an unchecked checkbox round-tripped through a form would send.
  is_negotiable: z.preprocess((v) => v === true || v === 'true' || v === 'on', z.boolean()),
});

// ---------------------------------------------------------------------------
// Step 2 — Property details
// ---------------------------------------------------------------------------
export const detailsSchema = z.object({
  area: optionalNumber(1, 999_999_999, 'Enter a valid area'),
  area_unit: z.preprocess((v) => (v === '' || v == null ? 'sqft' : v), z.enum(AREA_UNITS)),
  bedrooms: optionalNumber(0, 50, 'Bedrooms must be between 0 and 50'),
  bathrooms: optionalNumber(0, 50, 'Bathrooms must be between 0 and 50'),
  balconies: optionalNumber(0, 50, 'Balconies must be between 0 and 50'),
  floor_number: optionalNumber(-10, 200, 'Enter a valid floor number'),
  total_floors: optionalNumber(0, 200, 'Enter a valid number of floors'),
  property_age: optionalNumber(0, 200, 'Enter the age in years'),
  furnishing_status: optionalEnum(['unfurnished', 'semi_furnished', 'fully_furnished'] as const),
  parking: z.preprocess((v) => (v === '' || v == null ? 0 : Number(v)), z.number().min(0).max(50).default(0)),
  facing: optionalEnum(FACINGS),
  description: optionalText(8000),
});

// ---------------------------------------------------------------------------
// Step 3 — Location
// ---------------------------------------------------------------------------
export const locationSchema = z.object({
  country: z.preprocess(
    (v) => (typeof v !== 'string' || v.trim() === '' ? 'India' : v.trim()),
    z.string().max(60),
  ),
  state: optionalText(80),
  city: z.string().trim().min(2, 'Enter the city').max(80, 'City name is too long'),
  locality: optionalText(120),
  pincode: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z
      .string()
      .regex(/^[1-9][0-9]{5}$/, 'Enter a valid 6-digit PIN code')
      .optional(),
  ),
  address: optionalText(500),
  latitude: optionalNumber(-90, 90, 'Latitude must be between -90 and 90'),
  longitude: optionalNumber(-180, 180, 'Longitude must be between -180 and 180'),
});

/** Everything required to create or update the listing row itself. */
// ---------------------------------------------------------------------------
// Step 5 — Media
// ---------------------------------------------------------------------------
/**
 * The photos are rows in `property_images`, so the only field the media step
 * contributes to the listing itself is the video link.
 *
 * Stored canonicalised rather than as typed: `parseVideoUrl` reduces whatever
 * was pasted to a provider and an id and rebuilds the URL, because this value
 * ends up in an `<iframe src>` and a string that merely *contains* a YouTube
 * host is not the same as one that *is* a YouTube video.
 */
export const mediaSchema = z.object({
  /**
   * Optional, and optional all the way down: an unrecognised link is dropped
   * rather than raised as an error.
   *
   * It used to fail validation, which meant one unparseable character in a
   * field nobody has to fill stopped the whole draft from saving — the title,
   * the price, the description, everything. An optional field that can block
   * the rest of the form is not optional in any sense the person filling it in
   * would recognise.
   *
   * Nothing is lost quietly: the field warns, live and in place, that a link it
   * cannot read will not be kept. And the column's CHECK constraint still means
   * only a canonical YouTube or Vimeo URL can ever reach the database, so being
   * lenient here cannot put a bad value in it.
   */
  /**
   * `null` rather than `undefined` when there is no usable link, because these
   * values go straight into an UPDATE and supabase-js omits undefined keys. With
   * `undefined`, emptying the box would leave the old video on the listing and
   * there would be no way to take one off.
   */
  video_url: z.preprocess(
    (value) => (typeof value === 'string' ? (parseVideoUrl(value)?.canonicalUrl ?? null) : null),
    z.string().nullable(),
  ),
});

export const propertyDraftSchema = basicInfoSchema
  .merge(detailsSchema)
  .merge(locationSchema)
  .merge(mediaSchema);

export type PropertyDraftInput = z.input<typeof propertyDraftSchema>;
export type PropertyDraft = z.output<typeof propertyDraftSchema>;

/**
 * What must be true before a listing can leave `draft` for `pending`.
 * Deliberately stricter than the draft schema: a listing with no description,
 * no area and no photos wastes a moderator's time and converts badly.
 */
export const submissionSchema = propertyDraftSchema.extend({
  description: z
    .string()
    .trim()
    .min(40, 'Write at least a couple of sentences describing the property'),
  area: z.preprocess(
    (v) => (v === '' || v == null ? undefined : Number(v)),
    z.number({ invalid_type_error: 'Area is required before submitting' }).positive(),
  ),
  locality: z.string().trim().min(2, 'Locality helps buyers find your listing'),
});

export const amenitiesSchema = z.object({
  amenities: z.array(z.string().trim().min(2).max(60)).max(40),
});

/**
 * Minimum photo count for a submission.
 *
 * One, not three. Three was the better listing — a flat with one photo converts
 * poorly — but it was also a wall in front of sellers who had a single decent
 * picture, and a listing that never gets posted converts worse than a thin one.
 */
export const MIN_IMAGES_FOR_SUBMISSION = 1;

/**
 * "one photo" / "3 photos".
 *
 * The requirement is stated in four places — the uploader, the submit button's
 * hint, the wizard's last step and the Server Action that enforces it — so the
 * phrasing lives here with the number. Changing the constant and leaving
 * "at least 1 photos" in the copy is the obvious next bug otherwise.
 */
export function photoRequirementLabel(count = MIN_IMAGES_FOR_SUBMISSION): string {
  return count === 1 ? 'one photo' : `${count} photos`;
}

export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGES_PER_PROPERTY = 15;
