import { z } from 'zod';
import { normaliseMobile } from '@/lib/format';

/**
 * Validation for the company profile (§2).
 *
 * Every rule here is also a CHECK constraint on `organizations`. This layer
 * exists to produce a sentence a person can act on; the database is what makes
 * the rule true.
 */

const ORGANIZATION_TYPES = [
  'owner',
  'agent',
  'broker',
  'builder',
  'promoter',
  'developer',
  'real_estate_company',
] as const;

/**
 * An untouched `<input>` submits `''`, and a column read back from the database
 * arrives as `null`. Both mean "not filled in", and both have to become
 * `undefined` so `.optional()` accepts them — the listing schema learned this
 * the hard way, where a `null` address stopped sellers from publishing at all.
 */
function optionalText(max: number, message?: string) {
  return z.preprocess(
    (v) => (v === null || (typeof v === 'string' && v.trim() === '') ? undefined : v),
    z.string().trim().max(max, message ?? `Keep this under ${max} characters`).optional(),
  );
}

export const organizationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Enter your company name')
    .max(150, 'That company name is too long'),

  /**
   * At least one, because `organizations_types_not_empty_check` requires it and
   * because a company profile that claims to be nothing is not useful to a
   * buyer deciding whether to trust it.
   *
   * Checkbox groups submit one entry per checked box and nothing at all when
   * none are checked, so the action collects with `getAll` and this sees `[]`.
   */
  org_types: z
    .array(z.enum(ORGANIZATION_TYPES))
    .min(1, 'Choose at least one — what does your company do?')
    .max(ORGANIZATION_TYPES.length),

  about: optionalText(8000, 'Keep the description under 8,000 characters'),

  established_year: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
    z
      .number({ invalid_type_error: 'Enter the year as four digits' })
      .int('Enter the year as four digits')
      .min(1800, 'That year looks too early')
      .max(new Date().getFullYear(), 'That year is in the future')
      .optional(),
  ),

  phone: z.preprocess(
    (v) => {
      if (v === null || (typeof v === 'string' && v.trim() === '')) return undefined;
      return typeof v === 'string' ? normaliseMobile(v) : v;
    },
    z
      .string()
      .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number')
      .optional(),
  ),

  email: z.preprocess(
    (v) => (v === null || (typeof v === 'string' && v.trim() === '') ? undefined : v),
    z.string().trim().email('Enter a valid email address').max(200).optional(),
  ),

  /**
   * The CHECK requires a scheme, so a company typing `abcbuilders.in` would be
   * rejected by the database with nothing useful to show them. Adding `https://`
   * here is the difference between a saved profile and a dead end.
   */
  website: z.preprocess(
    (v) => {
      if (v === null || typeof v !== 'string' || v.trim() === '') return undefined;
      const trimmed = v.trim();
      return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    },
    z
      .string()
      .max(300, 'That link is too long')
      .regex(/^https?:\/\/.+\..+/i, 'Enter a valid website address')
      .optional(),
  ),

  office_address: optionalText(500),
  locality: optionalText(120),
  city: optionalText(80),
  state: optionalText(80),

  pincode: z.preprocess(
    (v) => (v === null || (typeof v === 'string' && v.trim() === '') ? undefined : v),
    z
      .string()
      .trim()
      .regex(/^[1-9][0-9]{5}$/, 'Enter a valid 6-digit PIN code')
      .optional(),
  ),

  /**
   * Shown publicly, the way a builder prints them on a brochure. These are
   * registration identifiers, not the documents behind them — §2 keeps the
   * documents private and those are not collected here at all.
   */
  gst_number: optionalText(30, 'That GST number is too long'),
  rera_number: optionalText(60, 'That RERA number is too long'),
});

export type OrganizationInput = z.input<typeof organizationSchema>;
export type OrganizationValues = z.output<typeof organizationSchema>;

export type OrganizationFieldName = keyof OrganizationValues;
