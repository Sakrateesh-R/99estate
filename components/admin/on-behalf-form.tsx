'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Info, TriangleAlert, UserCheck } from 'lucide-react';
import { Field, Input, PriceInput, Select } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { createListingOnBehalf, type MatchedSeller } from '@/lib/admin/on-behalf';
import {
  LISTING_TYPE_LABELS,
  PROPERTY_TYPE_LABELS,
  SELLER_TYPE_LABELS,
} from '@/lib/constants';
import type { Enums } from '@/types/database.types';

/**
 * §12 — the on-behalf form.
 *
 * Collects who the seller is and enough of the listing to open a draft, then
 * hands off to the same wizard a seller uses for the description, area,
 * amenities and photos. Duplicating those five steps here would mean two forms
 * to keep in step with the schema, and the second one would lose.
 */

const SELLER_TYPES: Enums<'user_role'>[] = ['owner', 'agent', 'builder'];
const LISTING_TYPES: Enums<'listing_type'>[] = ['sale', 'rent', 'pg'];
const PROPERTY_TYPES = Object.keys(PROPERTY_TYPE_LABELS) as Enums<'property_type'>[];

/**
 * Named rather than `Record<string, string>`: the project compiles with
 * `noUncheckedIndexedAccess`, so an index signature would make every read
 * `string | undefined` and the form would be full of `?? ''`.
 */
type FormValues = {
  owner_name: string;
  owner_mobile: string;
  owner_email: string;
  seller_type: string;
  listing_type: string;
  property_type: string;
  title: string;
  price: string;
  city: string;
  locality: string;
  video_url: string;
};

const EMPTY: FormValues = {
  owner_name: '',
  owner_mobile: '',
  owner_email: '',
  seller_type: 'owner',
  listing_type: 'sale',
  property_type: 'apartment',
  title: '',
  price: '',
  city: '',
  locality: '',
  video_url: '',
};

export function OnBehalfForm({ cities }: { cities: { city: string; state: string }[] }) {
  const router = useRouter();
  const toast = useToast();

  const [values, setValues] = React.useState<FormValues>(EMPTY);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  /**
   * Set when the mobile or email already belongs to somebody. The form does not
   * proceed until the admin has looked at who that is — attaching a stranger's
   * listing to a real account because of a mistyped digit is not a mistake you
   * can spot afterwards.
   */
  const [match, setMatch] = React.useState<MatchedSeller | null>(null);

  function set(name: keyof FormValues, value: string) {
    setValues((v) => ({ ...v, [name]: value }));
    // Clear the error as soon as the field is touched; re-validated on submit.
    setFieldErrors((e) => (e[name] ? { ...e, [name]: '' } : e));
    // Any change to who the seller is invalidates a confirmation already given.
    if (name === 'owner_mobile' || name === 'owner_email') setMatch(null);
  }

  async function submit(confirmSellerId?: string) {
    setBusy(true);
    setFieldErrors({});

    const result = await createListingOnBehalf({
      ...values,
      confirm_seller_id: confirmSellerId ?? '',
    });

    setBusy(false);

    if (!result.ok) {
      setFieldErrors(result.fieldErrors ?? {});
      toast({ tone: 'error', title: 'Could not create the listing', description: result.error });
      return;
    }

    if (result.data.kind === 'needs-confirmation') {
      setMatch(result.data.seller);
      return;
    }

    const { propertyId, sellerWasCreated, claimable } = result.data;
    toast({
      tone: 'success',
      title: 'Draft created',
      description: sellerWasCreated
        ? claimable
          ? 'A claimable account was created for the seller.'
          : 'A placeholder record was created — the seller cannot sign in, so their enquiries come to you.'
        : 'Added to the existing seller account.',
    });

    // Straight into the wizard to finish it: a draft with no photos cannot be
    // submitted, so stopping here would leave the job half done.
    router.push(`/dashboard/properties/${propertyId}/edit`);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit(match?.id);
      }}
      className="space-y-8"
    >
      <section>
        <h2 className="text-sm font-semibold text-ink-900">Who the listing belongs to</h2>
        <p className="mt-0.5 text-xs text-ink-500">
          This is the person a buyer reaches when they unlock the contact. Their number is what gets
          disclosed, so make sure it is one they answer.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Full name"
            htmlFor="owner_name"
            required
            error={fieldErrors.owner_name}
            hint="Shown to buyers on the listing."
          >
            <Input
              id="owner_name"
              name="owner_name"
              value={values.owner_name}
              onChange={(e) => set('owner_name', e.target.value)}
              autoComplete="off"
            />
          </Field>

          <Field
            label="Mobile number"
            htmlFor="owner_mobile"
            required
            error={fieldErrors.owner_mobile}
            hint="10 digits. Disclosed on a successful contact unlock."
          >
            <Input
              id="owner_mobile"
              name="owner_mobile"
              inputMode="numeric"
              value={values.owner_mobile}
              onChange={(e) => set('owner_mobile', e.target.value)}
              autoComplete="off"
            />
          </Field>

          <Field
            label="Email"
            htmlFor="owner_email"
            error={fieldErrors.owner_email}
            hint="Optional. With it they can sign in with Google later and take over the listing; without it they cannot."
            className="sm:col-span-2"
          >
            <Input
              id="owner_email"
              name="owner_email"
              type="email"
              value={values.owner_email}
              onChange={(e) => set('owner_email', e.target.value)}
              autoComplete="off"
            />
          </Field>

          <Field
            label="They are the"
            htmlFor="seller_type"
            required
            error={fieldErrors.seller_type}
            hint="Buyers filter on this."
          >
            <Select
              id="seller_type"
              name="seller_type"
              value={values.seller_type}
              onChange={(e) => set('seller_type', e.target.value)}
            >
              {SELLER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {SELLER_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {!values.owner_email.trim() ? (
          <p className="mt-3 flex items-start gap-2 rounded-field border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>
              With no email, this seller cannot sign in. Enquiries will still be created and charged
              for as normal, so <strong className="font-semibold">you will need to pass them on</strong> —
              they are listed under Enquiries on the listings you posted.
            </span>
          </p>
        ) : null}
      </section>

      {match ? (
        <section className="rounded-card border border-amber-300 bg-amber-50 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
            <TriangleAlert className="size-4 shrink-0" aria-hidden />
            That {match.matchedOn === 'mobile' ? 'number' : 'email'} already belongs to an account
          </p>
          <dl className="mt-2.5 space-y-1 text-xs text-amber-900">
            <div className="flex gap-2">
              <dt className="font-medium">Name</dt>
              <dd>{match.fullName?.trim() || 'Unnamed'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-medium">Email</dt>
              <dd className="font-mono">{match.email}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-medium">Mobile</dt>
              <dd>{match.mobile ?? '—'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-medium">Can sign in</dt>
              <dd>{match.isPlaceholder ? 'No — placeholder record' : 'Yes'}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-amber-900">
            If this is the same person, the listing will be added to their account. If it is not,
            correct the number or email — do not post under somebody else.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit(match.id)}
              className="inline-flex items-center gap-1.5 rounded-field bg-ink-900 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-ink-800 disabled:opacity-60"
            >
              <UserCheck className="size-3.5" aria-hidden />
              {busy ? 'Creating…' : 'Yes, post under this account'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setMatch(null)}
              className="rounded-field border border-amber-300 bg-white px-3.5 py-2 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-100 disabled:opacity-60"
            >
              No, let me correct it
            </button>
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="text-sm font-semibold text-ink-900">The listing</h2>
        <p className="mt-0.5 text-xs text-ink-500">
          Enough to open a draft. The next screen is the same form sellers use — description, area,
          amenities and photos.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Title"
            htmlFor="title"
            required
            error={fieldErrors.title}
            hint="At least 8 characters."
            className="sm:col-span-2"
          >
            <Input
              id="title"
              name="title"
              value={values.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="2 BHK apartment in Thillai Nagar"
            />
          </Field>

          <Field label="For" htmlFor="listing_type" required error={fieldErrors.listing_type}>
            <Select
              id="listing_type"
              name="listing_type"
              value={values.listing_type}
              onChange={(e) => set('listing_type', e.target.value)}
            >
              {LISTING_TYPES.map((t) => (
                <option key={t} value={t}>
                  {LISTING_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Property type"
            htmlFor="property_type"
            required
            error={fieldErrors.property_type}
          >
            <Select
              id="property_type"
              name="property_type"
              value={values.property_type}
              onChange={(e) => set('property_type', e.target.value)}
            >
              {PROPERTY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {PROPERTY_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Price"
            htmlFor="price"
            required
            error={fieldErrors.price}
            hint={values.listing_type === 'sale' ? 'Total, in rupees.' : 'Per month, in rupees.'}
          >
            <PriceInput
              id="price"
              name="price"
              value={values.price}
              onChange={(e) => set('price', e.target.value)}
            />
          </Field>

          <Field label="City" htmlFor="city" required error={fieldErrors.city}>
            <Input
              id="city"
              name="city"
              list="on-behalf-cities"
              value={values.city}
              onChange={(e) => set('city', e.target.value)}
            />
            <datalist id="on-behalf-cities">
              {cities.map((c) => (
                <option key={c.city} value={c.city} />
              ))}
            </datalist>
          </Field>

          <Field
            label="Locality"
            htmlFor="locality"
            error={fieldErrors.locality}
            hint="Required before the listing can be submitted."
            className="sm:col-span-2"
          >
            <Input
              id="locality"
              name="locality"
              value={values.locality}
              onChange={(e) => set('locality', e.target.value)}
            />
          </Field>

          <Field
            label="Video tour link — optional"
            htmlFor="video_url"
            error={fieldErrors.video_url}
            hint="Leave blank if there is no video. YouTube or Vimeo only — anything else is ignored rather than saved."
            className="sm:col-span-2"
          >
            <Input
              id="video_url"
              name="video_url"
              value={values.video_url}
              onChange={(e) => set('video_url', e.target.value)}
              placeholder="https://youtu.be/…"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3 border-t border-ink-200 pt-5">
        <button
          type="submit"
          disabled={busy}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-field bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-800 disabled:opacity-60',
          )}
        >
          {busy ? 'Creating…' : 'Create draft and continue'}
          <ArrowRight className="size-4" aria-hidden />
        </button>
        <p className="text-xs text-ink-500">
          Goes through the same moderation queue as any other listing.
        </p>
      </div>
    </form>
  );
}
