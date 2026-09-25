'use client';

import * as React from 'react';
import { cn, entriesOf } from '@/lib/utils';
import { Checkbox, Field, Input, PriceInput, Select, Textarea } from '@/components/ui/field';
import {
  AREA_UNIT_LABELS,
  FACING_LABELS,
  FURNISHING_LABELS,
  LAND_TYPES,
  LISTING_TYPE_LABELS,
  PROPERTY_TYPE_LABELS,
} from '@/lib/constants';
import type { Enums } from '@/types/database.types';

/** Every field is held as a string so the inputs stay controlled and empty stays empty. */
export type WizardValues = {
  listing_type: string;
  seller_type: string;
  property_type: string;
  title: string;
  price: string;
  is_negotiable: boolean;
  area: string;
  area_unit: string;
  bedrooms: string;
  bathrooms: string;
  balconies: string;
  floor_number: string;
  total_floors: string;
  property_age: string;
  furnishing_status: string;
  parking: string;
  facing: string;
  description: string;
  country: string;
  state: string;
  city: string;
  locality: string;
  pincode: string;
  address: string;
  latitude: string;
  longitude: string;
};

export type StepProps = {
  values: WizardValues;
  errors: Record<string, string>;
  set: <K extends keyof WizardValues>(key: K, value: WizardValues[K]) => void;
};

/**
 * Listing-level roles. `buyer` and `admin` are account roles and never apply.
 *
 * Labels are kept to a single word: these render as a three-column toggle that
 * is ~76px per cell on a 320px screen, and "Broker / Agent" wrapped to three
 * lines there.
 */
export const SELLER_TYPE_CHOICES = [
  { value: 'owner', label: 'Owner' },
  { value: 'agent', label: 'Broker' },
  { value: 'builder', label: 'Builder' },
] as const;

/** Same reasoning: "PG / Co-living" does not fit a third of a narrow screen. */
const LISTING_TYPE_SHORT: Record<string, string> = {
  sale: 'Sell',
  rent: 'Rent',
  pg: 'PG',
};

/** True for plots and land, where BHK / floors / furnishing are meaningless. */
export function isLandType(propertyType: string) {
  return LAND_TYPES.includes(propertyType as Enums<'property_type'>);
}

/* ------------------------------------------------------- Step 1 · Basics */

export function BasicInfoStep({ values, errors, set }: StepProps) {
  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="text-sm font-medium text-ink-800">
          What do you want to do with this property?
          <span className="ml-0.5 text-red-600">*</span>
        </legend>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {entriesOf(LISTING_TYPE_LABELS).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => set('listing_type', value)}
              aria-pressed={values.listing_type === value}
              className={cn(
                'rounded-field border px-3 py-3 text-sm font-semibold transition-colors',
                values.listing_type === value
                  ? 'border-brand-600 bg-brand-50 text-brand-800'
                  : 'border-ink-300 bg-white text-ink-700 hover:border-ink-400',
              )}
            >
              {LISTING_TYPE_SHORT[value] ?? label}
            </button>
          ))}
        </div>
        {errors.listing_type ? (
          <p role="alert" className="mt-1.5 text-sm font-medium text-red-600">
            {errors.listing_type}
          </p>
        ) : null}
      </fieldset>

      <fieldset>
        <legend className="text-sm font-medium text-ink-800">
          Are you the owner or a broker?
          <span className="ml-0.5 text-red-600">*</span>
        </legend>
        <p className="mt-1 text-xs text-ink-500">
          Shown on the listing. Buyers filter by this, and mislabelling it is the fastest way to
          get a listing reported.
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {SELLER_TYPE_CHOICES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => set('seller_type', value)}
              aria-pressed={values.seller_type === value}
              className={cn(
                'rounded-field border px-3 py-3 text-sm font-semibold transition-colors',
                values.seller_type === value
                  ? 'border-brand-600 bg-brand-50 text-brand-800'
                  : 'border-ink-300 bg-white text-ink-700 hover:border-ink-400',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {errors.seller_type ? (
          <p role="alert" className="mt-1.5 text-sm font-medium text-red-600">
            {errors.seller_type}
          </p>
        ) : null}
      </fieldset>

      <Field label="Property type" htmlFor="property_type" required error={errors.property_type}>
        <Select
          id="property_type"
          value={values.property_type}
          onChange={(e) => set('property_type', e.target.value)}
        >
          <option value="">Select a property type</option>
          {entriesOf(PROPERTY_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Listing title"
        htmlFor="title"
        required
        error={errors.title}
        hint="What a buyer sees first. Be specific — “3 BHK east-facing flat near Saravanampatti IT park” beats “Nice flat”."
      >
        <Input
          id="title"
          value={values.title}
          onChange={(e) => set('title', e.target.value)}
          maxLength={150}
          placeholder="3 BHK apartment in Saravanampatti, Coimbatore"
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label={values.listing_type === 'sale' ? 'Expected price' : 'Monthly rent'}
          htmlFor="price"
          required
          error={errors.price}
        >
          <PriceInput
            id="price"
            value={values.price}
            onChange={(e) => set('price', e.target.value.replace(/[^\d]/g, ''))}
            placeholder={values.listing_type === 'sale' ? '6500000' : '28000'}
          />
        </Field>

        <div className="flex items-end pb-3">
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink-700">
            <Checkbox
              checked={values.is_negotiable}
              onChange={(e) => set('is_negotiable', e.target.checked)}
            />
            Price is negotiable
          </label>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------ Step 2 · Details */

export function DetailsStep({ values, errors, set }: StepProps) {
  const land = isLandType(values.property_type);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Field label={land ? 'Plot area' : 'Built-up area'} htmlFor="area" error={errors.area}>
          <Input
            id="area"
            inputMode="decimal"
            value={values.area}
            onChange={(e) => set('area', e.target.value.replace(/[^\d.]/g, ''))}
            placeholder="1250"
          />
        </Field>

        <Field label="Unit" htmlFor="area_unit" error={errors.area_unit}>
          <Select
            id="area_unit"
            value={values.area_unit}
            onChange={(e) => set('area_unit', e.target.value)}
          >
            {entriesOf(AREA_UNIT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {!land ? (
        <>
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Bedrooms" htmlFor="bedrooms" error={errors.bedrooms}>
              <Input
                id="bedrooms"
                inputMode="numeric"
                value={values.bedrooms}
                onChange={(e) => set('bedrooms', e.target.value.replace(/[^\d]/g, ''))}
                placeholder="3"
              />
            </Field>
            <Field label="Bathrooms" htmlFor="bathrooms" error={errors.bathrooms}>
              <Input
                id="bathrooms"
                inputMode="numeric"
                value={values.bathrooms}
                onChange={(e) => set('bathrooms', e.target.value.replace(/[^\d]/g, ''))}
                placeholder="2"
              />
            </Field>
            <Field label="Balconies" htmlFor="balconies" error={errors.balconies}>
              <Input
                id="balconies"
                inputMode="numeric"
                value={values.balconies}
                onChange={(e) => set('balconies', e.target.value.replace(/[^\d]/g, ''))}
                placeholder="1"
              />
            </Field>
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Floor number" htmlFor="floor_number" error={errors.floor_number}>
              <Input
                id="floor_number"
                inputMode="numeric"
                value={values.floor_number}
                onChange={(e) => set('floor_number', e.target.value.replace(/[^\d-]/g, ''))}
                placeholder="4"
              />
            </Field>
            <Field label="Total floors" htmlFor="total_floors" error={errors.total_floors}>
              <Input
                id="total_floors"
                inputMode="numeric"
                value={values.total_floors}
                onChange={(e) => set('total_floors', e.target.value.replace(/[^\d]/g, ''))}
                placeholder="12"
              />
            </Field>
            <Field
              label="Age of property"
              htmlFor="property_age"
              error={errors.property_age}
              hint="In years. 0 for a new build."
            >
              <Input
                id="property_age"
                inputMode="numeric"
                value={values.property_age}
                onChange={(e) => set('property_age', e.target.value.replace(/[^\d]/g, ''))}
                placeholder="5"
              />
            </Field>
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Furnishing" htmlFor="furnishing_status" error={errors.furnishing_status}>
              <Select
                id="furnishing_status"
                value={values.furnishing_status}
                onChange={(e) => set('furnishing_status', e.target.value)}
              >
                <option value="">Not specified</option>
                {entriesOf(FURNISHING_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Parking spaces" htmlFor="parking" error={errors.parking}>
              <Input
                id="parking"
                inputMode="numeric"
                value={values.parking}
                onChange={(e) => set('parking', e.target.value.replace(/[^\d]/g, ''))}
                placeholder="1"
              />
            </Field>

            <Field label="Facing" htmlFor="facing" error={errors.facing}>
              <Select id="facing" value={values.facing} onChange={(e) => set('facing', e.target.value)}>
                <option value="">Not specified</option>
                {entriesOf(FACING_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </>
      ) : (
        <Field label="Facing" htmlFor="facing" error={errors.facing}>
          <Select id="facing" value={values.facing} onChange={(e) => set('facing', e.target.value)}>
            <option value="">Not specified</option>
            {entriesOf(FACING_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <Field
        label="Description"
        htmlFor="description"
        error={errors.description}
        hint={`${values.description.length}/8000 · Mention the neighbourhood, what is nearby, and why someone would want to live here. At least 40 characters to submit.`}
      >
        <Textarea
          id="description"
          rows={7}
          maxLength={8000}
          value={values.description}
          onChange={(e) => set('description', e.target.value)}
          placeholder="Spacious 3 BHK on the 4th floor of a gated community, 5 minutes from the IT park. East-facing with covered parking, 24x7 water and power backup…"
        />
      </Field>
    </div>
  );
}

/* ----------------------------------------------------- Step 3 · Location */

export function LocationStep({
  values,
  errors,
  set,
  cities,
}: StepProps & { cities: { city: string; state: string }[] }) {
  // Auto-fill the state when a known city is picked — one less thing to type,
  // and it keeps state spellings consistent across listings.
  function handleCityChange(city: string) {
    set('city', city);
    const match = cities.find((c) => c.city.toLowerCase() === city.trim().toLowerCase());
    if (match) set('state', match.state);
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="City" htmlFor="city" required error={errors.city}>
          <Input
            id="city"
            list="estate-cities"
            value={values.city}
            onChange={(e) => handleCityChange(e.target.value)}
            placeholder="Coimbatore"
            maxLength={80}
          />
          <datalist id="estate-cities">
            {cities.map((c) => (
              <option key={`${c.state}-${c.city}`} value={c.city} />
            ))}
          </datalist>
        </Field>

        <Field label="State" htmlFor="state" error={errors.state}>
          <Input
            id="state"
            value={values.state}
            onChange={(e) => set('state', e.target.value)}
            placeholder="Tamil Nadu"
            maxLength={80}
          />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Locality"
          htmlFor="locality"
          error={errors.locality}
          hint="The area buyers actually search for. Required before submitting."
        >
          <Input
            id="locality"
            value={values.locality}
            onChange={(e) => set('locality', e.target.value)}
            placeholder="Saravanampatti"
            maxLength={120}
          />
        </Field>

        <Field label="PIN code" htmlFor="pincode" error={errors.pincode}>
          <Input
            id="pincode"
            inputMode="numeric"
            value={values.pincode}
            onChange={(e) => set('pincode', e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
            placeholder="641035"
          />
        </Field>
      </div>

      <Field
        label="Full address"
        htmlFor="address"
        error={errors.address}
        hint="Only shown to buyers who have unlocked your contact."
      >
        <Textarea
          id="address"
          rows={3}
          value={values.address}
          onChange={(e) => set('address', e.target.value)}
          maxLength={500}
          placeholder="Flat 4B, Green Meadows, 2nd Street, Saravanampatti"
        />
      </Field>

      <details className="rounded-field border border-ink-200 bg-ink-50/60 p-4">
        <summary className="cursor-pointer text-sm font-medium text-ink-700">
          Add map coordinates (optional)
        </summary>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <Field label="Latitude" htmlFor="latitude" error={errors.latitude}>
            <Input
              id="latitude"
              inputMode="decimal"
              value={values.latitude}
              onChange={(e) => set('latitude', e.target.value.replace(/[^\d.-]/g, ''))}
              placeholder="11.0785"
            />
          </Field>
          <Field label="Longitude" htmlFor="longitude" error={errors.longitude}>
            <Input
              id="longitude"
              inputMode="decimal"
              value={values.longitude}
              onChange={(e) => set('longitude', e.target.value.replace(/[^\d.-]/g, ''))}
              placeholder="76.9966"
            />
          </Field>
        </div>
      </details>
    </div>
  );
}

/* ---------------------------------------------------- Step 4 · Amenities */

export function AmenitiesStep({
  options,
  selected,
  onToggle,
}: {
  options: { name: string; category: string }[];
  selected: string[];
  onToggle: (name: string) => void;
}) {
  const grouped = React.useMemo(() => {
    const map = new Map<string, string[]>();
    for (const option of options) {
      const list = map.get(option.category) ?? [];
      list.push(option.name);
      map.set(option.category, list);
    }
    return [...map.entries()];
  }, [options]);

  return (
    <div className="space-y-7">
      {grouped.map(([category, names]) => (
        <div key={category}>
          <h3 className="text-sm font-semibold capitalize text-ink-800">{category}</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {names.map((name) => {
              const active = selected.includes(name);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => onToggle(name)}
                  aria-pressed={active}
                  className={cn(
                    'rounded-full border px-3.5 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'border-brand-600 bg-brand-50 text-brand-800'
                      : 'border-ink-300 bg-white text-ink-700 hover:border-ink-400',
                  )}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
