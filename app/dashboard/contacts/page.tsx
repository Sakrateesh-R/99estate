import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ImageIcon, KeyRound, MessageCircle, Phone } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge, PropertyStatusBadge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { getUnlockedContacts, summariseUnlocked } from '@/lib/contacts/unlocked';
import { requireProfile } from '@/lib/auth/session';
import {
  formatListingPrice,
  formatMobile,
  formatRelative,
  formatRupees,
  telHref,
  whatsappHref,
} from '@/lib/format';
import { propertyPath } from '@/lib/utils';
import { SITE_NAME } from '@/lib/constants';

export const metadata: Metadata = {
  title: 'Unlocked contacts',
  robots: { index: false, follow: false },
};

/**
 * §14 — the contacts this buyer has unlocked.
 *
 * The number is the thing they paid for, so it is shown in full here with call
 * and WhatsApp to hand — not hidden behind another click. Everything on this
 * page already belongs to them.
 *
 * A listing that has since been sold, taken down or deleted keeps its row. The
 * unlock was bought, and losing the seller's number because the advert came
 * down would be taking away the thing that was paid for.
 */
export default async function UnlockedContactsPage() {
  await requireProfile();

  const contacts = await getUnlockedContacts();
  const summary = summariseUnlocked(contacts);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Unlocked contacts</h1>
          <p className="mt-1.5 text-[0.9375rem] text-ink-600">
            Every seller you have reached through {SITE_NAME}. These stay yours.
          </p>
        </div>
      </div>

      {contacts.length === 0 ? (
        <EmptyState
          className="mt-8"
          icon={<KeyRound className="size-6" />}
          title="No contacts unlocked yet"
          description="When you unlock a seller's number on a listing, it appears here so you never have to find it again."
          action={
            <ButtonLink href="/properties" size="sm">
              Browse properties
            </ButtonLink>
          }
        />
      ) : (
        <>
          <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Contacts unlocked" value={String(summary.total)} />
            <Stat label="Free" value={String(summary.total - summary.paid)} />
            <Stat label="Paid" value={formatRupees(summary.spent)} sub={`${summary.paid} contact${summary.paid === 1 ? '' : 's'}`} />
          </dl>

          <ul className="mt-6 space-y-3">
            {contacts.map((contact) => (
              <li
                key={contact.contactUnlockId}
                className="rounded-card border border-ink-200 bg-white p-4"
              >
                <div className="flex gap-4">
                  <div className="relative size-20 shrink-0 overflow-hidden rounded-field bg-ink-100 sm:size-24">
                    {contact.property?.coverImageUrl ? (
                      <Image
                        src={contact.property.coverImageUrl}
                        alt=""
                        fill
                        sizes="96px"
                        className="object-cover"
                      />
                    ) : (
                      <span className="flex h-full items-center justify-center text-ink-300">
                        <ImageIcon className="size-5" aria-hidden />
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h2 className="truncate font-semibold text-ink-900">
                          {contact.property ? (
                            contact.property.slug ? (
                              <Link
                                href={propertyPath({
                                  id: contact.propertyId,
                                  slug: contact.property.slug,
                                  public_code: contact.property.publicCode,
                                })}
                                className="hover:text-brand-700 hover:underline"
                              >
                                {contact.property.title}
                              </Link>
                            ) : (
                              contact.property.title
                            )
                          ) : (
                            // The listing is gone; the contact is not.
                            <span className="text-ink-500">Listing no longer available</span>
                          )}
                        </h2>
                        {contact.property ? (
                          <p className="mt-0.5 truncate text-sm text-ink-500">
                            {[contact.property.locality, contact.property.city]
                              .filter(Boolean)
                              .join(', ')}{' '}
                            ·{' '}
                            {formatListingPrice(
                              contact.property.price,
                              contact.property.listingType,
                            )}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {contact.property && contact.property.status !== 'published' ? (
                          <PropertyStatusBadge status={contact.property.status} />
                        ) : null}
                        <Badge tone={contact.isFree ? 'neutral' : 'brand'}>
                          {contact.isFree ? 'Free' : formatRupees(contact.amount)}
                        </Badge>
                      </div>
                    </div>

                    {/* The number, in full. It is what was paid for. */}
                    <div className="mt-3 rounded-field bg-ink-50 px-3 py-2.5">
                      <p className="text-xs text-ink-500">
                        {contact.sellerName?.trim() || 'Seller'}
                      </p>
                      <p className="mt-0.5 font-semibold tabular-nums text-ink-950">
                        {contact.sellerMobile ? formatMobile(contact.sellerMobile) : 'Number unavailable'}
                      </p>
                    </div>

                    {contact.sellerMobile ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <a
                          href={telHref(contact.sellerMobile)}
                          className="inline-flex items-center gap-1.5 rounded-field bg-brand-700 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-800"
                        >
                          <Phone className="size-4" aria-hidden />
                          Call
                        </a>
                        <a
                          href={whatsappHref(
                            contact.sellerMobile,
                            contact.property
                              ? `Hi, I saw your listing "${contact.property.title}" on ${SITE_NAME}.`
                              : undefined,
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-field border border-ink-200 px-3.5 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50"
                        >
                          <MessageCircle className="size-4" aria-hidden />
                          WhatsApp
                        </a>
                      </div>
                    ) : null}

                    <p className="mt-2.5 text-xs text-ink-400">
                      Unlocked {formatRelative(contact.unlockedAt)}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-card border border-ink-200 bg-white p-4">
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className="mt-1 text-xl font-bold tabular-nums text-ink-950">{value}</dd>
      {sub ? <p className="mt-0.5 text-[0.6875rem] text-ink-400">{sub}</p> : null}
    </div>
  );
}
