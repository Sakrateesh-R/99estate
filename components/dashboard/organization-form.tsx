'use client';

import { useActionState, useEffect } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Label, Textarea } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { ORGANIZATION_TYPE_LABELS } from '@/lib/constants';
import type { OrganizationFormState } from '@/lib/organizations/actions';
import type { Enums, Tables } from '@/types/database.types';

const INITIAL: OrganizationFormState = { ok: false };

const TYPE_ORDER: Enums<'organization_type'>[] = [
  'builder',
  'developer',
  'promoter',
  'real_estate_company',
  'agent',
  'broker',
  'owner',
];

type Action = (
  state: OrganizationFormState,
  formData: FormData,
) => Promise<OrganizationFormState>;

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending}>
      {label}
    </Button>
  );
}

/**
 * The company profile form, used both to register a company and to edit one.
 *
 * One component rather than two, because the fields and their rules are
 * identical — the only differences are the submit label, whether a hidden id is
 * posted, and that a successful registration navigates away (the action
 * redirects) while a successful edit stays put and toasts.
 */
export function OrganizationForm({
  action,
  organization,
  submitLabel = 'Save changes',
}: {
  action: Action;
  organization?: Tables<'organizations'> | null;
  submitLabel?: string;
}) {
  const [state, formAction] = useActionState(action, INITIAL);
  const toast = useToast();

  useEffect(() => {
    if (state.ok) toast({ tone: 'success', title: 'Company profile updated' });
  }, [state, toast]);

  const selectedTypes = new Set(organization?.org_types ?? ['builder']);

  return (
    <form action={formAction} className="space-y-6">
      {organization ? (
        <input type="hidden" name="organization_id" value={organization.id} />
      ) : null}

      {state.error ? (
        <div
          role="alert"
          className="rounded-field border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
        >
          {state.error}
        </div>
      ) : null}

      <fieldset className="space-y-5">
        <legend className="text-sm font-semibold text-ink-900">About the company</legend>

        <Field
          label="Company name"
          htmlFor="name"
          required
          error={state.fieldErrors?.name}
          hint={
            organization
              ? 'Your public web address does not change when you rename — every link already shared keeps working.'
              : 'This is the name buyers will see on your projects.'
          }
        >
          <Input
            id="name"
            name="name"
            defaultValue={organization?.name ?? ''}
            maxLength={150}
            required
            autoComplete="organization"
          />
        </Field>

        {/* An array, not a single choice: a company genuinely is a builder *and*
            a developer *and* a promoter, and making it pick one would mean its
            public profile understated what it does. */}
        <div className="flex flex-col gap-1.5">
          <Label required>What does your company do?</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {TYPE_ORDER.map((type) => (
              <label
                key={type}
                className="flex cursor-pointer items-center gap-2.5 rounded-field border border-ink-200 px-3 py-2.5 text-sm text-ink-800 transition-colors hover:border-ink-300 hover:bg-ink-50 has-[:checked]:border-brand-300 has-[:checked]:bg-brand-50"
              >
                <Checkbox name="org_types" value={type} defaultChecked={selectedTypes.has(type)} />
                {ORGANIZATION_TYPE_LABELS[type]}
              </label>
            ))}
          </div>
          {state.fieldErrors?.org_types ? (
            <p role="alert" className="text-sm font-medium text-red-600">
              {state.fieldErrors.org_types}
            </p>
          ) : (
            <p className="text-xs text-ink-500">Choose everything that applies.</p>
          )}
        </div>

        <Field
          label="About"
          htmlFor="about"
          error={state.fieldErrors?.about}
          hint="Your track record, what you build, where you build it. Shown on your public profile."
        >
          <Textarea
            id="about"
            name="about"
            defaultValue={organization?.about ?? ''}
            rows={5}
            maxLength={8000}
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Year established"
            htmlFor="established_year"
            error={state.fieldErrors?.established_year}
          >
            <Input
              id="established_year"
              name="established_year"
              inputMode="numeric"
              placeholder="2009"
              defaultValue={organization?.established_year ?? ''}
            />
          </Field>

          <Field
            label="RERA registration number"
            htmlFor="rera_number"
            error={state.fieldErrors?.rera_number}
            hint="Shown publicly, the way you would print it on a brochure."
          >
            <Input
              id="rera_number"
              name="rera_number"
              defaultValue={organization?.rera_number ?? ''}
              maxLength={60}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-5 border-t border-ink-100 pt-6">
        <legend className="text-sm font-semibold text-ink-900">How buyers reach you</legend>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Office phone"
            htmlFor="phone"
            error={state.fieldErrors?.phone}
            hint="Your company's public number. Separate from your personal one."
          >
            <div className="flex">
              <span className="inline-flex h-11 shrink-0 items-center rounded-l-field border border-r-0 border-ink-300 bg-ink-100 px-3.5 text-[0.9375rem] font-medium text-ink-600">
                +91
              </span>
              <Input
                id="phone"
                name="phone"
                type="tel"
                inputMode="numeric"
                defaultValue={organization?.phone ?? ''}
                maxLength={15}
                className="rounded-l-none"
              />
            </div>
          </Field>

          <Field label="Office email" htmlFor="email" error={state.fieldErrors?.email}>
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={organization?.email ?? ''}
              maxLength={200}
            />
          </Field>
        </div>

        <Field
          label="Website"
          htmlFor="website"
          error={state.fieldErrors?.website}
          hint="You can leave off https:// — we will add it."
        >
          <Input
            id="website"
            name="website"
            placeholder="abcbuilders.in"
            defaultValue={organization?.website ?? ''}
            maxLength={300}
          />
        </Field>
      </fieldset>

      <fieldset className="space-y-5 border-t border-ink-100 pt-6">
        <legend className="text-sm font-semibold text-ink-900">Registered office</legend>

        <Field
          label="Address"
          htmlFor="office_address"
          error={state.fieldErrors?.office_address}
        >
          <Textarea
            id="office_address"
            name="office_address"
            defaultValue={organization?.office_address ?? ''}
            rows={2}
            maxLength={500}
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Locality" htmlFor="locality" error={state.fieldErrors?.locality}>
            <Input
              id="locality"
              name="locality"
              defaultValue={organization?.locality ?? ''}
              maxLength={120}
            />
          </Field>

          <Field label="City" htmlFor="city" error={state.fieldErrors?.city}>
            <Input id="city" name="city" defaultValue={organization?.city ?? ''} maxLength={80} />
          </Field>

          <Field label="State" htmlFor="state" error={state.fieldErrors?.state}>
            <Input id="state" name="state" defaultValue={organization?.state ?? ''} maxLength={80} />
          </Field>

          <Field label="PIN code" htmlFor="pincode" error={state.fieldErrors?.pincode}>
            <Input
              id="pincode"
              name="pincode"
              inputMode="numeric"
              defaultValue={organization?.pincode ?? ''}
              maxLength={6}
            />
          </Field>
        </div>

        <Field
          label="GST number"
          htmlFor="gst_number"
          error={state.fieldErrors?.gst_number}
          hint="Shown publicly. We never ask for your registration documents here."
        >
          <Input
            id="gst_number"
            name="gst_number"
            defaultValue={organization?.gst_number ?? ''}
            maxLength={30}
            className="sm:max-w-xs"
          />
        </Field>
      </fieldset>

      <div className="flex items-center gap-3 border-t border-ink-100 pt-6">
        <SubmitButton label={submitLabel} />
        {/* Said once, here, because it is the question every builder asks next
            and §22 makes the answer "not by filling in this form". */}
        <p className="text-xs text-ink-500">
          Verification is reviewed by 99Estate — it is not something this form can grant.
        </p>
      </div>
    </form>
  );
}
