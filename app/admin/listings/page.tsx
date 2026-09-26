import Link from 'next/link';
import { Handshake, PhoneCall, Plus, UserX } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge, PropertyStatusBadge } from '@/components/ui/badge';
import { getOnBehalfListings } from '@/lib/admin/queries';
import { formatListingPrice, formatMobile, formatRelative, telHref } from '@/lib/format';
import { propertyPath } from '@/lib/utils';

/**
 * §12 — listings an admin posted for somebody else.
 *
 * The enquiries sit on this page rather than a click away, because for a seller
 * who cannot sign in this is the only place they exist. A buyer has already paid
 * to reach that person; if nobody here passes the message on, they paid for
 * nothing.
 */
export default async function AdminOnBehalfListingsPage() {
  const listings = await getOnBehalfListings();

  const needingRelay = listings.filter((l) => l.seller_is_placeholder && l.leads.length > 0);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold text-ink-900">Posted on behalf</h1>
          <p className="mt-0.5 text-xs text-ink-500">
            Listings you created for an owner, broker or builder who did not sign up themselves.
          </p>
        </div>
        <Link
          href="/admin/listings/new"
          className="inline-flex items-center gap-1.5 rounded-field bg-brand-700 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-800"
        >
          <Plus className="size-4" aria-hidden />
          Post on behalf
        </Link>
      </div>

      {needingRelay.length > 0 ? (
        <div className="mt-5 flex items-start gap-3 rounded-card border border-amber-300 bg-amber-50 p-4">
          <PhoneCall className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden />
          <p className="text-sm text-amber-900">
            <strong className="font-semibold">
              {needingRelay.length} listing{needingRelay.length === 1 ? '' : 's'} with enquiries the
              seller cannot see.
            </strong>{' '}
            These sellers have no way to sign in, so the buyer&rsquo;s details below need passing on
            by phone.
          </p>
        </div>
      ) : null}

      {listings.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<Handshake className="size-6" />}
          title="Nothing posted on behalf yet"
          description="When you list a property for a walk-in owner or broker, it shows up here with any enquiries it produces."
        />
      ) : (
        <ul className="mt-5 space-y-3">
          {listings.map((listing) => (
            <li key={listing.id} className="rounded-card border border-ink-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <PropertyStatusBadge status={listing.status} />
                    {listing.seller_is_placeholder ? (
                      <Badge tone="warning">
                        <UserX className="size-3.5" aria-hidden />
                        Seller cannot sign in
                      </Badge>
                    ) : (
                      <Badge tone="neutral">Claimable account</Badge>
                    )}
                  </div>

                  <h2 className="mt-2 truncate font-semibold text-ink-900">
                    {listing.slug ? (
                      <Link
                        href={propertyPath({ id: listing.id, slug: listing.slug })}
                        className="hover:text-brand-700 hover:underline"
                      >
                        {listing.title}
                      </Link>
                    ) : (
                      listing.title
                    )}
                  </h2>
                  <p className="mt-0.5 text-sm text-ink-500">
                    {listing.city} · {formatListingPrice(listing.price, listing.listing_type)} ·
                    added {formatRelative(listing.created_at)}
                    {listing.posted_by_name ? ` by ${listing.posted_by_name}` : ''}
                  </p>
                </div>

                <Link
                  href={`/dashboard/properties/${listing.id}/edit`}
                  className="shrink-0 rounded-field border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-700 transition-colors hover:bg-ink-50"
                >
                  {listing.status === 'draft' ? 'Finish listing' : 'Edit listing'}
                </Link>
              </div>

              <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 rounded-field bg-ink-50 px-3 py-2 text-xs">
                <div className="flex gap-1.5">
                  <dt className="text-ink-500">Seller</dt>
                  <dd className="font-medium text-ink-900">
                    {listing.seller_name?.trim() || 'Unnamed'}
                  </dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="text-ink-500">Mobile</dt>
                  <dd className="font-medium text-ink-900">
                    {listing.seller_mobile ? (
                      <a href={telHref(listing.seller_mobile)} className="hover:underline">
                        {formatMobile(listing.seller_mobile)}
                      </a>
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
              </dl>

              {listing.leads.length > 0 ? (
                <div className="mt-3">
                  <p className="text-xs font-semibold text-ink-900">
                    {listing.leads.length} enquir{listing.leads.length === 1 ? 'y' : 'ies'}
                    {listing.seller_is_placeholder ? ' — relay these to the seller' : ''}
                  </p>
                  <ul className="mt-1.5 divide-y divide-ink-100 rounded-field border border-ink-200">
                    {listing.leads.map((lead) => (
                      <li
                        key={lead.id}
                        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs"
                      >
                        <span className="font-medium text-ink-900">
                          {lead.buyer_name?.trim() || 'Buyer'}
                          {lead.buyer_mobile ? (
                            <a
                              href={telHref(lead.buyer_mobile)}
                              className="ml-2 font-normal text-brand-700 hover:underline"
                            >
                              {formatMobile(lead.buyer_mobile)}
                            </a>
                          ) : null}
                        </span>
                        <span className="text-ink-400">{formatRelative(lead.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
