import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { after } from 'next/server';
import {
  Bath,
  BedDouble,
  Building2,
  CalendarDays,
  Car,
  ChevronRight,
  Compass,
  Eye,
  Layers,
  MapPin,
  Maximize2,
  Sofa,
  Sparkles,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PropertyGallery } from '@/components/property/property-gallery';
import { ContactUnlockCard } from '@/components/property/contact-unlock-card';
import { SavePropertyButton } from '@/components/property/save-property-button';
import { ReportPropertyDialog } from '@/components/property/report-property-dialog';
import { VerifiedBadge, Badge } from '@/components/ui/badge';
import {
  getPropertyDetail,
  recordPropertyView,
  getUnlockedAddress,
  type PropertyDetail,
} from '@/lib/properties/detail';
import { getContactState } from '@/lib/contacts/actions';
import { propertyIdFromSlug, propertyPath } from '@/lib/utils';
import { formatArea, formatCount, formatDate, formatListingPrice, formatRelative } from '@/lib/format';
import {
  FACING_LABELS,
  FURNISHING_LABELS,
  LISTING_TYPE_LABELS,
  PROPERTY_TYPE_LABELS,
  SELLER_TYPE_LABELS,
  SITE_NAME,
} from '@/lib/constants';
import { getSiteUrl } from '@/lib/env';

type PageProps = { params: Promise<{ slug: string }> };

/**
 * §23 — every listing gets a unique, descriptive SEO page.
 *
 * The URL carries a human-readable slug plus the id, so the slug can change
 * without breaking links. Nothing private goes into the metadata: no seller
 * name in the description, and never a phone number.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const id = propertyIdFromSlug(slug);
  if (!id) return { title: 'Property not found' };

  const data = await getPropertyDetail(id);
  if (!data) return { title: 'Property not found', robots: { index: false, follow: false } };

  const { property, images } = data;
  const location = [property.locality, property.city].filter(Boolean).join(', ');
  const price = formatListingPrice(property.price, property.listing_type);
  const bhk = property.bedrooms ? `${property.bedrooms} BHK ` : '';
  const type = PROPERTY_TYPE_LABELS[property.property_type];
  const verb = property.listing_type === 'sale' ? 'for sale' : property.listing_type === 'rent' ? 'for rent' : 'PG';

  const title = `${bhk}${type} ${verb} in ${location} — ${price}`;
  const description =
    property.description?.slice(0, 155).trim() ??
    `${bhk}${type} ${verb} in ${location} at ${price}. View full details free on ${SITE_NAME}.`;

  const canonical = propertyPath(property);
  const ogImage = images[0]?.publicUrl ?? property.cover_image_url;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      title,
      description,
      url: `${getSiteUrl()}${canonical}`,
      images: ogImage ? [{ url: ogImage, width: 1200, height: 750, alt: property.title }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
    // Only live listings belong in the index.
    robots: property.status === 'published' ? undefined : { index: false, follow: false },
  };
}

export default async function PropertyDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const id = propertyIdFromSlug(slug);
  if (!id) notFound();

  const data = await getPropertyDetail(id);
  if (!data) notFound();

  const { property, images, amenities, seller, isSaved, isOwnListing } = data;

  const [contactState, unlockedAddress] = await Promise.all([
    getContactState(property.id),
    getUnlockedAddress(property.id),
  ]);

  // View tracking runs after the response is streamed — it must never add
  // latency to the page it is measuring.
  after(() => recordPropertyView(property.id));

  const canonicalPath = propertyPath(property);
  const location = [property.locality, property.city, property.state].filter(Boolean).join(', ');
  const area = formatArea(property.area, property.area_unit);

  const specs: { icon: LucideIcon; label: string; value: string }[] = [];
  if (property.bedrooms) specs.push({ icon: BedDouble, label: 'Bedrooms', value: `${property.bedrooms}` });
  if (property.bathrooms) specs.push({ icon: Bath, label: 'Bathrooms', value: `${property.bathrooms}` });
  if (area) specs.push({ icon: Maximize2, label: 'Area', value: area });
  if (property.balconies) specs.push({ icon: Building2, label: 'Balconies', value: `${property.balconies}` });
  if (property.floor_number !== null || property.total_floors !== null) {
    specs.push({
      icon: Layers,
      label: 'Floor',
      value: `${property.floor_number ?? '—'}${property.total_floors ? ` of ${property.total_floors}` : ''}`,
    });
  }
  if (property.furnishing_status) {
    specs.push({ icon: Sofa, label: 'Furnishing', value: FURNISHING_LABELS[property.furnishing_status] });
  }
  if (property.parking > 0) specs.push({ icon: Car, label: 'Parking', value: `${property.parking}` });
  if (property.facing) specs.push({ icon: Compass, label: 'Facing', value: FACING_LABELS[property.facing] });
  if (property.property_age !== null) {
    specs.push({
      icon: CalendarDays,
      label: 'Age',
      value: property.property_age === 0 ? 'New build' : `${property.property_age} years`,
    });
  }

  return (
    <div className="pb-24 lg:pb-0">
      <script
        type="application/ld+json"
        // Structured data for rich results (§23). Deliberately free of any
        // seller contact information.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(buildListingJsonLd({ property, images, canonicalPath })),
        }}
      />

      <div className="container-page py-5 lg:py-8">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm text-ink-500">
          <Link href="/" className="hover:text-ink-900">Home</Link>
          <ChevronRight className="size-3.5" aria-hidden />
          <Link href="/properties" className="hover:text-ink-900">Properties</Link>
          <ChevronRight className="size-3.5" aria-hidden />
          <Link
            href={`/properties?city=${encodeURIComponent(property.city)}`}
            className="hover:text-ink-900"
          >
            {property.city}
          </Link>
          <ChevronRight className="size-3.5" aria-hidden />
          <span className="truncate text-ink-700">{PROPERTY_TYPE_LABELS[property.property_type]}</span>
        </nav>

        <div className="mt-5 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          {/* ---------------- Main column ---------------- */}
          <div className="min-w-0">
            <PropertyGallery images={images} title={property.title} />

            <header className="mt-6">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="neutral">{LISTING_TYPE_LABELS[property.listing_type]}</Badge>
                <Badge tone="neutral">{PROPERTY_TYPE_LABELS[property.property_type]}</Badge>
                <VerifiedBadge status={property.verification_status} />
                {property.is_featured ? (
                  <Badge tone="accent">
                    <Sparkles className="size-3.5" aria-hidden />
                    Featured
                  </Badge>
                ) : null}
              </div>

              <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-3xl font-bold tracking-tight text-ink-950 sm:text-4xl">
                    {formatListingPrice(property.price, property.listing_type)}
                    {property.is_negotiable ? (
                      <span className="ml-2 align-middle text-sm font-medium text-ink-500">
                        Negotiable
                      </span>
                    ) : null}
                  </p>
                  <h1 className="mt-2 text-xl font-semibold text-ink-900 sm:text-2xl">
                    {property.title}
                  </h1>
                  <p className="mt-1.5 flex items-center gap-1.5 text-[0.9375rem] text-ink-600">
                    <MapPin className="size-4 shrink-0 text-ink-400" aria-hidden />
                    {location}
                  </p>
                </div>

                <SavePropertyButton
                  propertyId={property.id}
                  initialSaved={isSaved}
                  nextPath={canonicalPath}
                  variant="labelled"
                />
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-ink-500">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="size-4" aria-hidden />
                  Posted {formatRelative(property.published_at ?? property.created_at)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Eye className="size-4" aria-hidden />
                  {formatCount(property.views_count)} views
                </span>
                {property.expires_at ? (
                  <span className="inline-flex items-center gap-1.5">
                    Listed until {formatDate(property.expires_at)}
                  </span>
                ) : null}
              </div>
            </header>

            {specs.length > 0 ? (
              <section className="mt-7 rounded-card border border-ink-200 bg-white p-5 sm:p-6">
                <h2 className="text-base font-semibold">Property details</h2>
                <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
                  {specs.map(({ icon: Icon, label, value }) => (
                    <div key={label} className="flex items-start gap-2.5">
                      <Icon className="mt-0.5 size-4 shrink-0 text-ink-400" aria-hidden />
                      <div className="min-w-0">
                        <dt className="text-xs text-ink-500">{label}</dt>
                        <dd className="truncate text-sm font-semibold text-ink-900">{value}</dd>
                      </div>
                    </div>
                  ))}
                </dl>
              </section>
            ) : null}

            {property.description ? (
              <section className="mt-6 rounded-card border border-ink-200 bg-white p-5 sm:p-6">
                <h2 className="text-base font-semibold">About this property</h2>
                <p className="mt-3 whitespace-pre-line text-[0.9375rem] leading-relaxed text-ink-700">
                  {property.description}
                </p>
              </section>
            ) : null}

            {amenities.length > 0 ? (
              <section className="mt-6 rounded-card border border-ink-200 bg-white p-5 sm:p-6">
                <h2 className="text-base font-semibold">Amenities</h2>
                <ul className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {amenities.map((amenity) => (
                    <li key={amenity} className="flex items-center gap-2 text-sm text-ink-700">
                      <span className="size-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden />
                      {amenity}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="mt-6 rounded-card border border-ink-200 bg-white p-5 sm:p-6">
              <h2 className="text-base font-semibold">Location</h2>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                <LocationRow label="Locality" value={property.locality} />
                <LocationRow label="City" value={property.city} />
                <LocationRow label="State" value={property.state} />
                <LocationRow label="PIN code" value={property.pincode} />
              </dl>

              {unlockedAddress ? (
                <div className="mt-4 rounded-field border border-brand-200 bg-brand-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand-800">
                    Full address
                  </p>
                  <p className="mt-1 text-sm text-ink-800">{unlockedAddress}</p>
                </div>
              ) : (
                <p className="mt-4 text-sm text-ink-500">
                  The exact address is shared once you unlock the seller&rsquo;s contact.
                </p>
              )}
            </section>

            <div className="mt-6 flex items-center justify-between gap-4">
              {!isOwnListing ? (
                <ReportPropertyDialog propertyId={property.id} nextPath={canonicalPath} />
              ) : (
                <span />
              )}
              <p className="text-xs text-ink-400">Listing ID: {property.id.slice(0, 8)}</p>
            </div>
          </div>

          {/* ---------------- Sidebar ---------------- */}
          <aside className="lg:sticky lg:top-28 lg:self-start">
            {contactState ? (
              <ContactUnlockCard
                propertyId={property.id}
                propertySlug={property.slug}
                propertyTitle={property.title}
                state={contactState}
                sellerName={seller?.name ?? null}
                sellerType={property.seller_type}
              />
            ) : null}

            <div className="mt-4 rounded-card border border-ink-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-ink-900">Listed by</h2>
              <div className="mt-3 flex items-center gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-700 text-base font-semibold text-white">
                  {(seller?.name ?? 'S').charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink-900">
                    {seller?.name ?? 'Verified seller'}
                  </p>
                  <p className="text-xs text-ink-500">
                    {SELLER_TYPE_LABELS[property.seller_type]}
                    {seller?.memberSince ? ` · on ${SITE_NAME} since ${formatDate(seller.memberSince)}` : ''}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-ink-500">
                Contact details are private until unlocked. 99Estate never shares a seller&rsquo;s
                number publicly.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function LocationRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="rounded-field border border-ink-200 px-4 py-2.5">
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-ink-900">{value}</dd>
    </div>
  );
}

function buildListingJsonLd({
  property,
  images,
  canonicalPath,
}: {
  property: PropertyDetail;
  images: { publicUrl: string }[];
  canonicalPath: string;
}) {
  const url = `${getSiteUrl()}${canonicalPath}`;

  return {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name: property.title,
    description: property.description ?? undefined,
    url,
    datePosted: property.published_at ?? property.created_at,
    image: images.slice(0, 6).map((i) => i.publicUrl),
    address: {
      '@type': 'PostalAddress',
      addressLocality: property.locality ?? property.city,
      addressRegion: property.state ?? undefined,
      postalCode: property.pincode ?? undefined,
      addressCountry: 'IN',
    },
    ...(property.latitude && property.longitude
      ? {
          geo: {
            '@type': 'GeoCoordinates',
            latitude: property.latitude,
            longitude: property.longitude,
          },
        }
      : {}),
    offers: {
      '@type': 'Offer',
      price: property.price,
      priceCurrency: 'INR',
      availability: 'https://schema.org/InStock',
      url,
    },
    ...(property.bedrooms ? { numberOfRooms: property.bedrooms } : {}),
    ...(property.area_sqft
      ? {
          floorSize: {
            '@type': 'QuantitativeValue',
            value: Number(property.area_sqft),
            unitCode: 'FTK',
          },
        }
      : {}),
  };
}
