'use client';

import Image from 'next/image';
import { Bath, BedDouble, Building, Calendar, Car, Compass, ImageIcon, Layers, MapPin, Maximize2, Sofa } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { formatArea, formatListingPrice } from '@/lib/format';
import {
  FACING_LABELS,
  FURNISHING_LABELS,
  PROPERTY_TYPE_LABELS,
} from '@/lib/constants';
import type { Enums } from '@/types/database.types';
import type { WizardValues } from '@/components/dashboard/property-wizard/steps';
import type { RegisteredImage } from '@/lib/properties/image-actions';

/**
 * Step 6 — what the listing will look like to a buyer.
 *
 * Renders from the in-memory wizard values rather than re-fetching, so the
 * seller sees exactly what they just typed, including unsaved edits.
 */
export function PreviewStep({
  values,
  amenities,
  images,
}: {
  values: WizardValues;
  amenities: string[];
  images: RegisteredImage[];
}) {
  const cover = images.find((i) => i.isCover) ?? images[0];
  const price = Number(values.price || 0);
  const listingType = (values.listing_type || 'sale') as Enums<'listing_type'>;
  const area = values.area
    ? formatArea(Number(values.area), (values.area_unit || 'sqft') as Enums<'area_unit'>)
    : null;

  const specs: { icon: LucideIcon; label: string; value: string }[] = [];
  if (values.bedrooms) specs.push({ icon: BedDouble, label: 'Bedrooms', value: `${values.bedrooms} BHK` });
  if (values.bathrooms) specs.push({ icon: Bath, label: 'Bathrooms', value: values.bathrooms });
  if (area) specs.push({ icon: Maximize2, label: 'Area', value: area });
  if (values.floor_number || values.total_floors) {
    specs.push({
      icon: Layers,
      label: 'Floor',
      value: `${values.floor_number || '—'}${values.total_floors ? ` of ${values.total_floors}` : ''}`,
    });
  }
  if (values.furnishing_status) {
    specs.push({
      icon: Sofa,
      label: 'Furnishing',
      value: FURNISHING_LABELS[values.furnishing_status as Enums<'furnishing_status'>],
    });
  }
  if (values.parking && values.parking !== '0') {
    specs.push({ icon: Car, label: 'Parking', value: values.parking });
  }
  if (values.facing) {
    specs.push({
      icon: Compass,
      label: 'Facing',
      value: FACING_LABELS[values.facing as Enums<'facing_direction'>],
    });
  }
  if (values.property_age) {
    specs.push({ icon: Calendar, label: 'Age', value: `${values.property_age} yr` });
  }

  return (
    <div className="overflow-hidden rounded-card border border-ink-200 bg-white">
      <div className="relative aspect-[16/9] bg-ink-100">
        {cover ? (
          <Image src={cover.publicUrl} alt="" fill sizes="(min-width: 1024px) 48rem, 100vw" className="object-cover" />
        ) : (
          <div className="grid h-full place-items-center text-ink-300">
            <ImageIcon className="size-12" aria-hidden />
          </div>
        )}
        {images.length > 1 ? (
          <span className="absolute bottom-3 right-3 rounded-full bg-ink-950/70 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
            {images.length} photos
          </span>
        ) : null}
      </div>

      <div className="p-5 sm:p-6">
        <p className="text-2xl font-bold tracking-tight text-ink-950">
          {price > 0 ? formatListingPrice(price, listingType) : 'Price not set'}
          {values.is_negotiable ? (
            <span className="ml-2 align-middle text-sm font-medium text-ink-500">Negotiable</span>
          ) : null}
        </p>

        <h3 className="mt-2 text-lg font-semibold text-ink-900">
          {values.title || 'Untitled listing'}
        </h3>

        <p className="mt-1.5 flex items-center gap-1.5 text-sm text-ink-500">
          <MapPin className="size-4 shrink-0" aria-hidden />
          {[values.locality, values.city, values.state].filter(Boolean).join(', ') || 'Location not set'}
        </p>

        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-3 py-1 text-xs font-semibold text-ink-700">
          <Building className="size-3.5" aria-hidden />
          {values.property_type
            ? PROPERTY_TYPE_LABELS[values.property_type as Enums<'property_type'>]
            : 'Type not set'}
        </p>

        {specs.length > 0 ? (
          <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-ink-100 pt-5 sm:grid-cols-4">
            {specs.map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-start gap-2">
                <Icon className="mt-0.5 size-4 shrink-0 text-ink-400" aria-hidden />
                <div className="min-w-0">
                  <dt className="text-xs text-ink-500">{label}</dt>
                  <dd className="truncate text-sm font-semibold text-ink-900">{value}</dd>
                </div>
              </div>
            ))}
          </dl>
        ) : null}

        {values.description ? (
          <div className="mt-5 border-t border-ink-100 pt-5">
            <h4 className="text-sm font-semibold text-ink-900">About this property</h4>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-600">
              {values.description}
            </p>
          </div>
        ) : null}

        {amenities.length > 0 ? (
          <div className="mt-5 border-t border-ink-100 pt-5">
            <h4 className="text-sm font-semibold text-ink-900">Amenities</h4>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {amenities.map((amenity) => (
                <span
                  key={amenity}
                  className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-800 ring-1 ring-inset ring-brand-200"
                >
                  {amenity}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-6 rounded-field border border-dashed border-ink-300 bg-ink-50 p-4">
          <p className="text-sm font-semibold text-ink-800">Contact section</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-500">
            Buyers see your name and seller type here, plus an{' '}
            <strong className="font-semibold text-ink-700">Unlock Contact</strong> button. Your phone
            number appears only after a buyer unlocks it — and every unlock becomes a lead in your
            dashboard.
          </p>
        </div>
      </div>
    </div>
  );
}
