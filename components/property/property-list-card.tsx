import Image from 'next/image';
import Link from 'next/link';
import {
  Bath,
  BedDouble,
  Building2,
  Camera,
  CheckCircle2,
  Compass,
  ImageIcon,
  Lock,
  MapPin,
  Maximize2,
  MessageCircle,
  Phone,
  Sofa,
} from 'lucide-react';
import { cn, propertyPath } from '@/lib/utils';
import {
  formatArea,
  formatListingPrice,
  formatMobile,
  formatRelative,
  telHref,
  whatsappHref,
} from '@/lib/format';
import {
  FACING_LABELS,
  FURNISHING_LABELS,
  PROPERTY_TYPE_LABELS,
  SELLER_TYPE_LABELS,
} from '@/lib/constants';
import { VerifiedBadge } from '@/components/ui/badge';
import { SavePropertyButton } from '@/components/property/save-property-button';
import type { PropertyCardData, UnlockedContact } from '@/lib/properties/queries';

/**
 * Horizontal result row — the default shape on 99acres, Magicbricks and
 * Housing search pages, and the right one here too.
 *
 * A grid optimises for browsing; a list optimises for comparing. Someone who
 * has just applied five filters is comparing, so the wide row gives each
 * result room for the description snippet and the full spec strip that a grid
 * tile has to drop.
 *
 * Stacks to a vertical card below `sm`, where there is no width to exploit.
 */
export function PropertyListCard({
  property,
  priority = false,
  isSaved = false,
  photoCount,
  unlocked,
}: {
  property: PropertyCardData;
  priority?: boolean;
  isSaved?: boolean;
  photoCount?: number;
  /** Set when this viewer already holds a settled unlock for the listing. */
  unlocked?: UnlockedContact;
}) {
  const href = propertyPath(property);
  const location = [property.locality, property.city].filter(Boolean).join(', ');
  const area = formatArea(property.area, property.area_unit);

  const specs = [
    property.bedrooms ? { icon: BedDouble, value: `${property.bedrooms} BHK` } : null,
    property.bathrooms ? { icon: Bath, value: `${property.bathrooms} Bath` } : null,
    area ? { icon: Maximize2, value: area } : null,
    property.furnishing_status
      ? { icon: Sofa, value: FURNISHING_LABELS[property.furnishing_status] }
      : null,
    property.facing ? { icon: Compass, value: FACING_LABELS[property.facing] } : null,
  ].filter(Boolean) as { icon: typeof BedDouble; value: string }[];

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-card border border-ink-200 bg-white shadow-card transition-shadow hover:shadow-card-hover sm:flex-row">
      <div className="relative aspect-[4/3] shrink-0 overflow-hidden bg-ink-100 sm:aspect-auto sm:w-64 lg:w-72">
        {property.cover_image_url ? (
          <Image
            src={property.cover_image_url}
            alt={property.title}
            fill
            sizes="(min-width: 1024px) 18rem, (min-width: 640px) 16rem, 92vw"
            priority={priority}
            className="object-cover transition-transform duration-500 ease-out-soft group-hover:scale-[1.04]"
          />
        ) : (
          <div className="grid h-full min-h-44 place-items-center text-ink-300">
            <ImageIcon className="size-10" aria-hidden />
          </div>
        )}

        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-ink-950/50 to-transparent"
          aria-hidden
        />

        <span className="absolute left-2.5 top-2.5 rounded bg-white/95 px-2 py-1 text-[0.6875rem] font-bold uppercase tracking-wide text-ink-900">
          {property.listing_type === 'sale'
            ? 'For sale'
            : property.listing_type === 'rent'
              ? 'For rent'
              : 'PG'}
        </span>

        {photoCount && photoCount > 1 ? (
          <span className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1 rounded bg-ink-950/75 px-2 py-1 text-[0.6875rem] font-semibold text-white backdrop-blur-sm">
            <Camera className="size-3" aria-hidden />
            {photoCount}
          </span>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded bg-ink-100 px-1.5 py-0.5 text-[0.6875rem] font-semibold text-ink-700">
                <Building2 className="size-3" aria-hidden />
                {PROPERTY_TYPE_LABELS[property.property_type]}
              </span>
              <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[0.6875rem] font-semibold text-brand-800">
                {SELLER_TYPE_LABELS[property.seller_type]}
              </span>
              <VerifiedBadge status={property.verification_status} />
              {unlocked ? (
                <span className="inline-flex items-center gap-1 rounded bg-brand-700 px-1.5 py-0.5 text-[0.6875rem] font-bold text-white">
                  <CheckCircle2 className="size-3" aria-hidden />
                  Contact unlocked
                </span>
              ) : null}
            </div>

            <h3 className="mt-1.5 line-clamp-1 text-base font-semibold text-ink-900">
              <Link href={href} className="after:absolute after:inset-0 after:content-['']">
                {property.title}
              </Link>
            </h3>

            {location ? (
              <p className="mt-1 flex items-center gap-1 text-[0.8125rem] text-ink-500">
                <MapPin className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{location}</span>
              </p>
            ) : null}
          </div>

          <div className="shrink-0 text-right">
            <p className="price text-2xl leading-none">
              {formatListingPrice(property.price, property.listing_type)}
            </p>
            {property.is_negotiable ? (
              <p className="mt-1 text-[0.6875rem] text-ink-500">Negotiable</p>
            ) : null}
          </div>
        </div>

        <dl className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-y border-ink-100 py-2.5 text-[0.8125rem] font-medium text-ink-700">
          {specs.map(({ icon: Icon, value }) => (
            <div key={value} className="inline-flex items-center gap-1.5">
              <Icon className="size-3.5 text-ink-400" aria-hidden />
              <dd>{value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-auto flex items-center justify-between gap-3 pt-3">
          <span className="text-[0.6875rem] text-ink-500">
            Posted {formatRelative(property.published_at ?? property.created_at)}
          </span>

          <div className="relative z-20 flex items-center gap-2">
            <SavePropertyButton
              propertyId={property.id}
              initialSaved={isSaved}
              nextPath={href}
              className="size-9 border border-ink-200 shadow-none"
            />
            {unlocked ? (
              // Already unlocked — offering to "unlock" again is misleading,
              // and the number is what the user actually wants at this point.
              <>
                <a
                  href={telHref(unlocked.mobile)}
                  className="inline-flex items-center gap-1.5 rounded-field bg-brand-700 px-3.5 py-2 text-xs font-bold text-white transition-colors hover:bg-brand-800"
                >
                  <Phone className="size-3.5" aria-hidden />
                  {formatMobile(unlocked.mobile)}
                </a>
                <a
                  href={whatsappHref(
                    unlocked.mobile,
                    `Hi${unlocked.name ? ` ${unlocked.name}` : ''}, I saw your listing "${property.title}" on 99Estate.`,
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Message on WhatsApp"
                  className="grid size-9 place-items-center rounded-field bg-[#25D366] text-white transition-opacity hover:opacity-90"
                >
                  <MessageCircle className="size-4" aria-hidden />
                </a>
              </>
            ) : (
              <Link
                href={href}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-field bg-accent-500 px-3.5 py-2 text-xs font-bold text-ink-950',
                  'transition-colors hover:bg-accent-400',
                )}
              >
                <Lock className="size-3.5" aria-hidden />
                Unlock contact
              </Link>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
