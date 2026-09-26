import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { PropertyWizard } from '@/components/dashboard/property-wizard/property-wizard';
import type { WizardValues } from '@/components/dashboard/property-wizard/steps';
import { PropertyStatusBadge } from '@/components/ui/badge';
import { requireCompleteProfile } from '@/lib/auth/session';
import { getAmenityOptions, getPropertyForEdit } from '@/lib/properties/seller-queries';
import { getActiveCities } from '@/lib/properties/queries';
import type { Tables } from '@/types/database.types';

export const metadata: Metadata = {
  title: 'Edit property',
  robots: { index: false, follow: false },
};

/** Numbers and enums come back typed; the wizard holds everything as strings. */
function toWizardValues(property: Tables<'properties'>): WizardValues {
  const str = (value: string | number | null) => (value === null ? '' : String(value));

  return {
    listing_type: property.listing_type,
    seller_type: ['owner', 'agent', 'builder'].includes(property.seller_type) ? property.seller_type : 'owner',
    property_type: property.property_type,
    title: property.title,
    price: str(property.price),
    is_negotiable: property.is_negotiable,
    area: str(property.area),
    area_unit: property.area_unit,
    bedrooms: str(property.bedrooms),
    bathrooms: str(property.bathrooms),
    balconies: str(property.balconies),
    floor_number: str(property.floor_number),
    total_floors: str(property.total_floors),
    property_age: str(property.property_age),
    furnishing_status: property.furnishing_status ?? '',
    parking: str(property.parking),
    facing: property.facing ?? '',
    description: property.description ?? '',
    country: property.country,
    state: property.state ?? '',
    city: property.city,
    locality: property.locality ?? '',
    pincode: property.pincode ?? '',
    address: property.address ?? '',
    latitude: str(property.latitude),
    longitude: str(property.longitude),
    video_url: property.video_url ?? '',
  };
}

export default async function EditPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireCompleteProfile();

  /**
   * Admins skip the ownership filter so they can finish a listing they posted
   * on a seller's behalf (§12) in the same wizard. RLS still decides what they
   * can actually read.
   */
  const isAdmin = profile.role === 'admin';

  const [data, amenityOptions, cities] = await Promise.all([
    getPropertyForEdit(id, isAdmin ? null : profile.id),
    getAmenityOptions(),
    getActiveCities(),
  ]);

  if (!data) notFound();

  const onBehalf = isAdmin && data.property.seller_id !== profile.id;

  return (
    <div>
      <Link
        href={onBehalf ? '/admin/listings' : '/dashboard/properties'}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 transition-colors hover:text-ink-900"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {onBehalf ? 'Listings posted on behalf' : 'Back to my properties'}
      </Link>

      {onBehalf ? (
        <p className="mt-4 rounded-card border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
          {/*
            Worth saying plainly. Everything on this screen — the description,
            the photos, the price — is published in somebody else's name, and
            their phone number is what a buyer pays to reach.
          */}
          You are editing a listing that belongs to another account. It will be published under the
          seller&rsquo;s name, and their number is what buyers unlock.
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">
            {data.property.title}
          </h1>
          <p className="mt-1.5 text-[0.9375rem] text-ink-600">
            Editing a live listing sends it back for a quick re-review.
          </p>
        </div>
        <PropertyStatusBadge status={data.property.status} />
      </div>

      {data.property.status === 'rejected' && data.property.rejection_reason ? (
        <div className="mt-5 rounded-card border border-red-200 bg-red-50 px-5 py-4">
          <p className="text-sm font-semibold text-red-900">This listing needs changes</p>
          <p className="mt-1 text-sm text-red-800">{data.property.rejection_reason}</p>
        </div>
      ) : null}

      <div className="mt-8">
        <PropertyWizard
          propertyId={data.property.id}
          initialValues={toWizardValues(data.property)}
          initialAmenities={data.amenities}
          initialImages={data.images}
          amenityOptions={amenityOptions}
          cities={cities}
          publishesDirectly={isAdmin}
        />
      </div>
    </div>
  );
}
