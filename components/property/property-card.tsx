import Image from 'next/image';
import Link from 'next/link';
import { Bath, BedDouble, Camera, CheckCircle2, ImageIcon, Lock, MapPin, Maximize2, Phone } from 'lucide-react';
import { cn, propertyPath } from '@/lib/utils';
import { formatArea, formatListingPrice, formatMobile, formatRelative, telHref } from '@/lib/format';
import {
  FURNISHING_LABELS,
  PROPERTY_TYPE_LABELS,
  SELLER_TYPE_LABELS,
} from '@/lib/constants';
import { VerifiedBadge } from '@/components/ui/badge';
import { SavePropertyButton } from '@/components/property/save-property-button';
import type { PropertyCardData, UnlockedContact } from '@/lib/properties/queries';

/**
 * The atom of the marketplace, built to portal conventions rather than SaaS
 * ones:
 *
 *   - the photograph gets a fixed 4:3 frame and fills it edge to edge
 *   - price is the loudest element, not the title
 *   - the facts a buyer filters on (BHK, bath, area) sit in one scannable row
 *   - "posted by Owner/Agent/Builder" is a trust signal, so it is on the card
 *   - the contact CTA lives on the card, so a result can be acted on without
 *     opening it
 *
 * Carries no contact information of any kind (§8).
 */
export function PropertyCard({
  property,
  priority = false,
  isSaved = false,
  photoCount,
  unlocked,
  className,
}: {
  property: PropertyCardData;
  /** Set on the first row above the fold so LCP is a real image. */
  priority?: boolean;
  isSaved?: boolean;
  photoCount?: number;
  /** Set when this viewer already holds a settled unlock for the listing. */
  unlocked?: UnlockedContact;
  className?: string;
}) {
  const href = propertyPath(property);
  const location = [property.locality, property.city].filter(Boolean).join(', ');
  const area = formatArea(property.area, property.area_unit);

  return (
    <article
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-card border border-ink-200 bg-white',
        'shadow-card transition-shadow duration-200 hover:shadow-card-hover',
        className,
      )}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-ink-100">
        {property.cover_image_url ? (
          <Image
            src={property.cover_image_url}
            alt={property.title}
            fill
            sizes="(min-width: 1280px) 22rem, (min-width: 1024px) 30vw, (min-width: 640px) 45vw, 92vw"
            priority={priority}
            className="object-cover transition-transform duration-500 ease-out-soft group-hover:scale-[1.04]"
          />
        ) : (
          <div className="grid h-full place-items-center text-ink-300">
            <ImageIcon className="size-10" aria-hidden />
          </div>
        )}

        {/* Gradient scrim so white chips stay legible over any photograph. */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-ink-950/55 to-transparent"
          aria-hidden
        />

        <div className="absolute left-2.5 top-2.5 flex flex-wrap items-center gap-1.5">
          <span className="rounded bg-white/95 px-2 py-1 text-[0.6875rem] font-bold uppercase tracking-wide text-ink-900">
            {property.listing_type === 'sale'
              ? 'For sale'
              : property.listing_type === 'rent'
                ? 'For rent'
                : 'PG'}
          </span>
          <VerifiedBadge status={property.verification_status} className="bg-white/95" />
          {unlocked ? (
            <span className="inline-flex items-center gap-1 rounded bg-brand-700 px-2 py-1 text-[0.6875rem] font-bold uppercase tracking-wide text-white">
              <CheckCircle2 className="size-3" aria-hidden />
              Unlocked
            </span>
          ) : null}
        </div>

        {/* Save sits above the stretched link so it stays clickable. */}
        <div className="absolute right-2.5 top-2.5 z-20">
          <SavePropertyButton
            propertyId={property.id}
            initialSaved={isSaved}
            nextPath={href}
            className="size-9 shadow-md"
          />
        </div>

        <div className="absolute inset-x-2.5 bottom-2.5 flex items-end justify-between gap-2">
          <span className="rounded bg-ink-950/75 px-2 py-1 text-[0.6875rem] font-semibold text-white backdrop-blur-sm">
            {SELLER_TYPE_LABELS[property.seller_type]}
          </span>
          {photoCount && photoCount > 1 ? (
            <span className="inline-flex items-center gap-1 rounded bg-ink-950/75 px-2 py-1 text-[0.6875rem] font-semibold text-white backdrop-blur-sm">
              <Camera className="size-3" aria-hidden />
              {photoCount}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-3.5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="price text-[1.375rem] leading-none">
            {formatListingPrice(property.price, property.listing_type)}
          </p>
          {property.is_negotiable ? (
            <span className="shrink-0 text-[0.6875rem] font-medium text-ink-500">Negotiable</span>
          ) : null}
        </div>

        <h3 className="mt-2 line-clamp-2 text-sm font-semibold leading-snug text-ink-900">
          {/* Stretched link: the whole card is the hit target, but the
              accessible name stays the listing title. */}
          <Link href={href} className="after:absolute after:inset-0 after:content-['']">
            {property.title}
          </Link>
        </h3>

        {location ? (
          <p className="mt-1 flex items-center gap-1 text-xs text-ink-500">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{location}</span>
          </p>
        ) : null}

        {/* The filterable facts, in one scannable strip. */}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-ink-100 pt-2.5 text-xs font-medium text-ink-700">
          {property.bedrooms ? (
            <span className="inline-flex items-center gap-1">
              <BedDouble className="size-3.5 text-ink-400" aria-hidden />
              {property.bedrooms} BHK
            </span>
          ) : null}
          {property.bathrooms ? (
            <span className="inline-flex items-center gap-1">
              <Bath className="size-3.5 text-ink-400" aria-hidden />
              {property.bathrooms}
            </span>
          ) : null}
          {area ? (
            <span className="inline-flex items-center gap-1">
              <Maximize2 className="size-3.5 text-ink-400" aria-hidden />
              {area}
            </span>
          ) : null}
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          <span className="min-w-0 truncate text-[0.6875rem] text-ink-500">
            {PROPERTY_TYPE_LABELS[property.property_type]}
            {property.furnishing_status ? ` · ${FURNISHING_LABELS[property.furnishing_status]}` : ''}
            {' · '}
            {formatRelative(property.published_at ?? property.created_at)}
          </span>

          {unlocked ? (
            // Already unlocked: show it, and make the number actionable right
            // here. `relative z-20` lifts it above the stretched card link.
            <a
              href={telHref(unlocked.mobile)}
              className="relative z-20 inline-flex shrink-0 items-center gap-1.5 rounded-field bg-brand-700 px-2.5 py-1.5 text-[0.6875rem] font-bold text-white transition-colors hover:bg-brand-800"
            >
              <Phone className="size-3" aria-hidden />
              {formatMobile(unlocked.mobile)}
            </a>
          ) : (
            /* Visual affordance only — the stretched link above carries the
               navigation, so this must not be a second focusable control. */
            <span
              className="inline-flex shrink-0 items-center gap-1.5 rounded-field bg-accent-500 px-2.5 py-1.5 text-[0.6875rem] font-bold text-ink-950 transition-colors group-hover:bg-accent-400"
              aria-hidden
            >
              <Lock className="size-3" />
              Contact
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
