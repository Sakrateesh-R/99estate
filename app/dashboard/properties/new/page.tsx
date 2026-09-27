import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PropertyWizard, EMPTY_WIZARD_VALUES } from '@/components/dashboard/property-wizard/property-wizard';
import { requireCompleteProfile } from '@/lib/auth/session';
import { getAmenityOptions } from '@/lib/properties/seller-queries';
import { getActiveCities } from '@/lib/properties/queries';
import { LISTING_DURATION_DAYS } from '@/lib/constants';

export const metadata: Metadata = {
  title: 'Post a property',
  robots: { index: false, follow: false },
};

/**
 * §12 — the multi-step posting form.
 *
 * `requireCompleteProfile` is the UX gate; the database enforces the same rule
 * through the `properties_insert_own` policy, which checks
 * `profile_is_complete()`.
 */
export default async function NewPropertyPage() {
  const profile = await requireCompleteProfile();

  const [amenityOptions, cities] = await Promise.all([getAmenityOptions(), getActiveCities()]);

  // The account role is only a sensible default — the seller declares their
  // role per listing, because the same person can be an owner on one property
  // and a broker on the next.
  const defaultSellerType =
    profile.role === 'agent' || profile.role === 'builder' ? profile.role : 'owner';

  return (
    <div>
      <Link
        href="/dashboard/properties"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 transition-colors hover:text-ink-900"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to my properties
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Post a property</h1>
          <p className="mt-1.5 text-[0.9375rem] text-ink-600">
            Free to list, live for {LISTING_DURATION_DAYS} days, and we never take a commission.
          </p>
        </div>
        <span className="rounded-full bg-brand-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-brand-800 ring-1 ring-inset ring-brand-200">
          Always free
        </span>
      </div>

      <div className="mt-8">
        <PropertyWizard
          propertyId={null}
          initialValues={{ ...EMPTY_WIZARD_VALUES, seller_type: defaultSellerType }}
          initialAmenities={[]}
          initialImages={[]}
          amenityOptions={amenityOptions}
          cities={cities}
        />
      </div>
    </div>
  );
}
