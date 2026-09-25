import type { Enums } from '@/types/database.types';

/**
 * Indian-market formatting helpers.
 *
 * Property prices in India are read in lakh and crore, not in millions — a
 * ₹8,500,000 flat is "₹85 L". Getting this wrong makes the whole product feel
 * foreign, so every price on the site goes through here.
 */

const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

/** Exact amount with grouping: ₹85,00,000 */
export function formatRupees(value: number): string {
  return INR.format(Math.round(value));
}

/** Compact Indian notation: ₹1.25 Cr · ₹85 L · ₹45,000 */
export function formatPriceShort(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return 'Price on request';

  const CRORE = 10_000_000;
  const LAKH = 100_000;

  if (value >= CRORE) return `₹${trimZeros(value / CRORE)} Cr`;
  if (value >= LAKH) return `₹${trimZeros(value / LAKH)} L`;
  if (value >= 1_000) return `₹${new Intl.NumberFormat('en-IN').format(Math.round(value))}`;
  return `₹${Math.round(value)}`;
}

/** Price with the cadence a rental implies: "₹28,000/month". */
export function formatListingPrice(value: number, listingType: Enums<'listing_type'>): string {
  const base = formatPriceShort(value);
  return listingType === 'sale' ? base : `${base}/mo`;
}

function trimZeros(n: number): string {
  const rounded = n >= 100 ? Math.round(n) : Math.round(n * 100) / 100;
  return String(rounded);
}

// ---------------------------------------------------------------------------
// Area
// ---------------------------------------------------------------------------

const AREA_UNIT_LABEL: Record<Enums<'area_unit'>, string> = {
  sqft: 'sq.ft',
  sqm: 'sq.m',
  sqyd: 'sq.yd',
  acre: 'acre',
  hectare: 'hectare',
  cent: 'cent',
  guntha: 'guntha',
  bigha: 'bigha',
  marla: 'marla',
  kanal: 'kanal',
};

export function formatArea(area: number | null, unit: Enums<'area_unit'> | null): string | null {
  if (area == null || !unit) return null;
  const n = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(area);
  return `${n} ${AREA_UNIT_LABEL[unit]}`;
}

export function areaUnitLabel(unit: Enums<'area_unit'>): string {
  return AREA_UNIT_LABEL[unit];
}

// ---------------------------------------------------------------------------
// Mobile numbers
// ---------------------------------------------------------------------------

/** Strips +91 / 0 prefixes and non-digits, returning a bare 10-digit number. */
export function normaliseMobile(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

export function isValidIndianMobile(raw: string): boolean {
  return /^[6-9]\d{9}$/.test(normaliseMobile(raw));
}

/** Display form: +91 98765 43210 */
export function formatMobile(raw: string | null | undefined): string {
  if (!raw) return '';
  const n = normaliseMobile(raw);
  if (n.length !== 10) return raw;
  return `+91 ${n.slice(0, 5)} ${n.slice(5)}`;
}

/** tel: href */
export function telHref(raw: string): string {
  return `tel:+91${normaliseMobile(raw)}`;
}

/** WhatsApp deep link with an opening message. */
export function whatsappHref(raw: string, message?: string): string {
  const base = `https://wa.me/91${normaliseMobile(raw)}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const IST = 'Asia/Kolkata';

export function formatDate(value: string | Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: IST,
  }).format(new Date(value));
}

export function formatDateTime(value: string | Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: IST,
  }).format(new Date(value));
}

/** "Posted 3 days ago" — falls back to an absolute date beyond a month. */
export function formatRelative(value: string | Date): string {
  const then = new Date(value).getTime();
  const diffMs = Date.now() - then;
  const minutes = Math.round(diffMs / 60_000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;

  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;

  return formatDate(value);
}

/**
 * When the free quota comes back, as a date rather than a countdown.
 *
 * The reset is a fixed calendar boundary (00:00 IST), so "tomorrow, 26 Sep"
 * is both more truthful and more useful than "in 4h 20m" — a countdown
 * rendered on the server also goes stale the moment the page is cached or
 * left open, which a date never does.
 */
export function formatQuotaReset(target: string | Date): string {
  const reset = new Date(target);
  if (Number.isNaN(reset.getTime())) return 'at midnight';

  // Compare calendar days in IST, not elapsed hours.
  const istDay = (value: Date) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: IST,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(value);

  const dayDiff = Math.round(
    (Date.parse(istDay(reset)) - Date.parse(istDay(new Date()))) / 86_400_000,
  );

  const label = new Intl.DateTimeFormat('en-IN', {
    timeZone: IST,
    day: 'numeric',
    month: 'short',
  }).format(reset);

  if (dayDiff <= 0) return 'shortly';
  if (dayDiff === 1) return `tomorrow, ${label}`;
  return `on ${label}`;
}

export function formatCount(n: number): string {
  return new Intl.NumberFormat('en-IN', { notation: n >= 10_000 ? 'compact' : 'standard' }).format(n);
}
