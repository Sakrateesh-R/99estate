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
  /**
   * A sole proprietorship is not a separate legal person: the proprietor is
   * personally the contracting party and the Data Fiduciary. So the documents
   * name the proprietor alongside the trading name rather than presenting
   * "Sakdha" as an entity that could be sued on its own.
   */
  entityType: 'sole proprietorship',
  proprietorName: 'Sakrateesh R',
  registeredAddress: '282/9, Rasi Nagar, Chinna Andan Kovil Road, Karur, Tamil Nadu, India',
  /**
   * Empty by design. A proprietorship has no CIN or LLPIN, and registering for
   * GST is not required below the turnover threshold. Publish a GSTIN here if
   * and when one is obtained.
   */
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
