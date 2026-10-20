import { formatArea, formatListingPrice, formatPriceShort } from '@/lib/format';
import {
  FACING_LABELS,
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
  PROPERTY_TYPE_LABELS,
  SITE_NAME,
} from '@/lib/constants';
import type { Enums } from '@/types/database.types';

/**
 * §23 — the meta description for a listing.
 *
 * Built from the listing's own facts rather than from what the seller typed.
 *
 * The description field is free text and sellers use it as a spec sheet, so it
 * arrives looking like this:
 *
 *   "3-Storey House for Sale – Selvapuram\n\n📍 Location: Selvapuram, LIC
 *    Colony, Perur Main Road\n\n📐 Land Area: 1.75 Cents\n\n🧭 Facing: North"
 *
 * Sliced to 155 characters that is a broken sentence full of emoji and
 * newlines. Google rewrites most such descriptions, and where it does not, the
 * result in the results page reads as a fault.
 *
 * The facts, by contrast, are always present, always accurate and always
 * different per listing — which is the whole job. Nothing here is claimed that
 * the row does not state: no "verified", no "best", no "prime location".
 */

export function listingMetaDescription(property: {
  property_type: Enums<'property_type'>;
  listing_type: Enums<'listing_type'>;
  bedrooms: number | null;
  area: number | null;
  area_unit: Enums<'area_unit'>;
  facing: Enums<'facing_direction'> | null;
  price: number;
  locality: string | null;
  city: string;
}): string {
  const bhk = property.bedrooms ? `${property.bedrooms} BHK ` : '';
  const type = PROPERTY_TYPE_LABELS[property.property_type];
  const verb =
    property.listing_type === 'sale'
      ? 'for sale'
      : property.listing_type === 'rent'
        ? 'for rent'
        : 'for PG';

  const where = [property.locality, property.city].filter(Boolean).join(', ');
  const price = formatListingPrice(property.price, property.listing_type);

  // The lead sentence: what it is, where, how much. In that order, because
  // that is the order somebody reads a result in.
  const lead = `${bhk}${type} ${verb} in ${where} — ${price}.`;

  // Then whatever else is known, dropped quietly when it is not.
  const details = [
    formatArea(property.area, property.area_unit),
    property.facing ? `${FACING_LABELS[property.facing]} facing` : null,
  ].filter(Boolean);

  const middle = details.length > 0 ? ` ${details.join(', ')}.` : '';
  const tail = ` View photos and full details free on ${SITE_NAME}.`;

  return clampToWord(`${lead}${middle}${tail}`, 155);
}

/**
 * §23 applied to a project page.
 *
 * Built from the project's own columns for the same reason the listing version
 * is: `description` is free text a builder uses as a feature list, and sliced to
 * 155 characters that reads as a fault.
 *
 * Nothing is claimed that the row does not state. In particular the word
 * "verified" never appears — that is an admin decision recorded in
 * `verification_status`, and a meta description is exactly the place a reader
 * would take it at face value without being able to check.
 */
export function projectMetaDescription(
  project: {
    name: string;
    project_type: Enums<'project_type'>;
    status: Enums<'project_status'>;
    bedroom_options: number[];
    locality: string | null;
    city: string;
    price_min: number | null;
    price_max: number | null;
    total_units: number | null;
  },
  builderName: string | null,
): string {
  const bhk = [...project.bedroom_options].sort((a, b) => a - b);
  const config =
    bhk.length === 0
      ? PROJECT_TYPE_LABELS[project.project_type]
      : `${bhk.join(', ')} BHK ${PROJECT_TYPE_LABELS[project.project_type]}`;

  const where = [project.locality, project.city].filter(Boolean).join(', ');

  const price =
    project.price_min != null && project.price_max != null && project.price_min !== project.price_max
      ? `${formatPriceShort(project.price_min)} – ${formatPriceShort(project.price_max)}`
      : project.price_min != null || project.price_max != null
        ? formatPriceShort((project.price_min ?? project.price_max) as number)
        : null;

  const lead = `${config} in ${where}${price ? ` from ${price}` : ''}.`;

  const details = [
    builderName ? `By ${builderName}` : null,
    PROJECT_STATUS_LABELS[project.status],
    project.total_units ? `${project.total_units} units` : null,
  ].filter(Boolean);

  const middle = details.length > 0 ? ` ${details.join('. ')}.` : '';
  const tail = ` See availability and prices free on ${SITE_NAME}.`;

  return clampToWord(`${lead}${middle}${tail}`, 155);
}

/**
 * Trims to a length without cutting a word in half.
 *
 * Google truncates around 155–160 characters anyway; the point of doing it here
 * is that a sentence ending mid-word looks like a bug, whereas one ending early
 * just looks short. Falls back to a hard cut if there is no space to break on.
 */
export function clampToWord(value: string, max: number): string {
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;

  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,–—-]+$/, '') + '…';
}
