import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Building2, Eye, Heart, ImageIcon, KeyRound, Plus, Users } from 'lucide-react';
import { PropertyActions } from '@/components/dashboard/property-actions';
import { PropertyStatusBadge, VerifiedBadge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { requireProfile } from '@/lib/auth/session';
import { getSellerProperties, type SellerPropertyRow } from '@/lib/properties/seller-queries';
import { formatCount, formatDate, formatListingPrice } from '@/lib/format';

export const metadata: Metadata = {
  title: 'My properties',
  robots: { index: false, follow: false },
};

export default async function SellerPropertiesPage() {
  const profile = await requireProfile();
  const properties = await getSellerProperties(profile.id);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">My properties</h1>
          <p className="mt-1.5 text-[0.9375rem] text-ink-600">
            {properties.length === 0
              ? 'Nothing listed yet.'
              : `${properties.length} listing${properties.length === 1 ? '' : 's'}.`}
          </p>
        </div>

        <ButtonLink href="/dashboard/properties/new">
          <Plus className="size-4" aria-hidden />
          Post property
        </ButtonLink>
      </div>

      {properties.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<Building2 className="size-6" />}
            title="Your first listing is free"
            description="Post a property and start receiving leads from buyers who unlock your contact. It takes about five minutes."
            action={<ButtonLink href="/dashboard/properties/new">Post a property</ButtonLink>}
          />
        </div>
      ) : (
        <>
          {/* Cards on small screens; a real table from `lg`, where the extra
              columns actually fit (§20 responsive tables). */}
          <ul className="mt-8 space-y-4 lg:hidden">
            {properties.map((property) => (
              <li key={property.id} className="rounded-card border border-ink-200 bg-white p-4">
                <div className="flex gap-3">
                  <Thumb property={property} className="size-20" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-ink-900">{property.title}</p>
                      <PropertyActions property={property} />
                    </div>
                    <p className="mt-0.5 truncate text-xs text-ink-500">
                      {[property.locality, property.city].filter(Boolean).join(', ')}
                    </p>
                    <p className="mt-1 text-sm font-bold text-ink-950">
                      {formatListingPrice(property.price, property.listing_type)}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <PropertyStatusBadge status={property.status} />
                      <VerifiedBadge status={property.verification_status} />
                    </div>
                  </div>
                </div>

                <dl className="mt-3 grid grid-cols-4 gap-2 border-t border-ink-100 pt-3 text-center">
                  <MiniStat label="Views" value={property.views_count} />
                  <MiniStat label="Saves" value={property.saves_count} />
                  <MiniStat label="Unlocks" value={property.unlocks_count} />
                  <MiniStat label="Leads" value={property.leads_count} />
                </dl>
              </li>
            ))}
          </ul>

          <div className="mt-8 hidden overflow-hidden rounded-card border border-ink-200 bg-white lg:block">
            <table className="w-full text-sm">
              <caption className="sr-only">Your property listings and their performance</caption>
              <thead>
                <tr className="border-b border-ink-200 bg-ink-50 text-left text-xs uppercase tracking-wide text-ink-500">
                  <th scope="col" className="px-4 py-3 font-semibold">Property</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">
                    <span className="inline-flex items-center gap-1"><Eye className="size-3.5" aria-hidden />Views</span>
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">
                    <span className="inline-flex items-center gap-1"><Heart className="size-3.5" aria-hidden />Saves</span>
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">
                    <span className="inline-flex items-center gap-1"><KeyRound className="size-3.5" aria-hidden />Unlocks</span>
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">
                    <span className="inline-flex items-center gap-1"><Users className="size-3.5" aria-hidden />Leads</span>
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {properties.map((property) => (
                  <tr key={property.id} className="transition-colors hover:bg-ink-50/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Thumb property={property} className="size-12" />
                        <div className="min-w-0">
                          <Link
                            href={`/dashboard/properties/${property.id}/edit`}
                            className="block max-w-xs truncate font-semibold text-ink-900 hover:text-brand-700"
                          >
                            {property.title}
                          </Link>
                          <p className="truncate text-xs text-ink-500">
                            {formatListingPrice(property.price, property.listing_type)} ·{' '}
                            {[property.locality, property.city].filter(Boolean).join(', ')}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <PropertyStatusBadge status={property.status} />
                        {property.status === 'published' && property.expires_at ? (
                          <span className="text-[0.6875rem] text-ink-500">
                            Expires {formatDate(property.expires_at)}
                          </span>
                        ) : null}
                      </div>
                    </td>

                    <td className="px-3 py-3 text-right tabular-nums text-ink-700">{formatCount(property.views_count)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-ink-700">{formatCount(property.saves_count)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-ink-700">{formatCount(property.unlocks_count)}</td>
                    <td className="px-3 py-3 text-right tabular-nums font-semibold text-ink-900">{formatCount(property.leads_count)}</td>

                    <td className="px-4 py-3">
                      <PropertyActions property={property} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Thumb({ property, className }: { property: SellerPropertyRow; className?: string }) {
  return (
    <div className={`relative shrink-0 overflow-hidden rounded-lg bg-ink-100 ${className ?? ''}`}>
      {property.cover_image_url ? (
        <Image src={property.cover_image_url} alt="" fill sizes="80px" className="object-cover" />
      ) : (
        <div className="grid h-full place-items-center text-ink-300">
          <ImageIcon className="size-5" aria-hidden />
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-[0.6875rem] text-ink-500">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums text-ink-900">{formatCount(value)}</dd>
    </div>
  );
}
