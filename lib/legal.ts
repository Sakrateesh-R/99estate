/**
 * Legal identity and contact details used by /terms and /privacy.
 *
 * Several of these are required to be real and published under Indian law:
 *
 *   IT Rules 2021, Rule 3(2)   a named Grievance Officer with contact details,
 *                              acknowledging complaints in 24 hours and
 *                              resolving them in 15 days
 *   DPDP Act 2023, s.5         the identity and contact of the Data Fiduciary
 *   CP (E-Commerce) Rules 2020 the legal name and registered address
 */

export const LEGAL = {
  /** Operating entity behind 99Estate. */
  entityName: 'Sakdha',
  registeredAddress: '282/9, Rasi Nagar, Chinna Andan Kovil Road, Karur, Tamil Nadu, India',
  /** Empty until the entity has a CIN/LLPIN/GSTIN worth publishing. */
  registrationNumber: '',

  /** IT Rules 2021 requires this person to be named publicly. */
  grievanceOfficerName: 'Sakrateesh R',
  grievanceOfficerEmail: 'sakdha20241@gmail.com',

  supportEmail: 'sakdha20241@gmail.com',
  privacyEmail: 'sakdha20241@gmail.com',

  jurisdictionCity: 'Karur',
  jurisdictionState: 'Tamil Nadu',

  lastUpdated: '25 September 2026',
} as const;

/**
 * Flip to `true` only once a qualified Indian privacy/legal professional has
 * reviewed and approved both documents.
 *
 * Kept separate from the placeholder check because the two failure modes are
 * different: missing details make a document incomplete, whereas complete but
 * unreviewed text can look authoritative while still being wrong. Both
 * documents state this caveat themselves, so the banner matches the text.
 */
export const REVIEWED_BY_COUNSEL = false;

export type LegalReviewState = 'placeholders' | 'pending-review' | 'approved';

export function legalReviewState(): LegalReviewState {
  const unresolved = Object.values(LEGAL).some(
    (value) => value.includes('[') && value.includes(']'),
  );
  if (unresolved) return 'placeholders';
  return REVIEWED_BY_COUNSEL ? 'approved' : 'pending-review';
}

/** Business constants restated in the legal text, kept in one place. */
export const LEGAL_FACTS = {
  freeUnlocksPerDay: 2,
  paidUnlockPrice: 9,
  listingDurationDays: 90,
  /** IT Rules 2021, Rule 3(2)(b). */
  takedownHours: 36,
  grievanceAckHours: 24,
  grievanceResolutionDays: 15,
} as const;
