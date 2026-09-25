/**
 * Legal identity and contact details used by /terms and /privacy.
 *
 * These are placeholders. Indian law requires several of them to be real and
 * published:
 *
 *   IT Rules 2021, Rule 3(2)   a named Grievance Officer with contact details,
 *                              acknowledging complaints in 24 hours and
 *                              resolving them in 15 days
 *   DPDP Act 2023, s.5         the identity and contact of the Data Fiduciary,
 *                              in the notice shown when consent is taken
 *   CP (E-Commerce) Rules 2020 the legal name and registered address of the
 *                              marketplace entity
 *
 * Fill every value below before launch. While any placeholder remains, both
 * legal pages render a visible "not final" banner — so an unfinished document
 * cannot quietly pass for a binding one.
 */

export const LEGAL = {
  /** Registered legal name of the operating entity, e.g. "Acme Proptech Pvt Ltd". */
  entityName: '[LEGAL ENTITY NAME]',
  /** Registered office address as filed with the MCA. */
  registeredAddress: '[REGISTERED OFFICE ADDRESS]',
  /** CIN / LLPIN, or a proprietorship's GSTIN. Optional but expected. */
  registrationNumber: '[CIN / REGISTRATION NUMBER]',

  /** IT Rules 2021 requires this person to be named publicly. */
  grievanceOfficerName: '[GRIEVANCE OFFICER NAME]',
  grievanceOfficerEmail: '[grievance@99estate.in]',

  /** General support and privacy contact. */
  supportEmail: '[support@99estate.in]',
  privacyEmail: '[privacy@99estate.in]',

  /** Courts of this city get exclusive jurisdiction. */
  jurisdictionCity: '[CITY]',
  jurisdictionState: '[STATE]',

  /** Shown as "last updated" on both documents. */
  lastUpdated: '25 September 2026',
} as const;

/**
 * True while any value is still a bracketed placeholder.
 *
 * Drives the warning banner, so the documents advertise their own
 * incompleteness instead of looking authoritative before review.
 */
export function hasLegalPlaceholders(): boolean {
  return Object.values(LEGAL).some((value) => value.includes('[') && value.includes(']'));
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
