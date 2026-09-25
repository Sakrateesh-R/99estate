'use client';

import { useActionState, useEffect } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { updateProfileDetails, type ProfileFormState } from '@/lib/profile/actions';

const INITIAL: ProfileFormState = { ok: false };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending}>
      Save changes
    </Button>
  );
}

export function ProfileForm({
  defaultName,
  defaultMobile,
  email,
}: {
  defaultName: string;
  defaultMobile: string;
  email: string;
}) {
  const [state, formAction] = useActionState(updateProfileDetails, INITIAL);
  const toast = useToast();

  useEffect(() => {
    if (state.ok) toast({ tone: 'success', title: 'Profile updated' });
  }, [state, toast]);

  return (
    <form action={formAction} className="space-y-5">
      {state.error ? (
        <div
          role="alert"
          className="rounded-field border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
        >
          {state.error}
        </div>
      ) : null}

      <Field label="Full name" htmlFor="full_name" required error={state.fieldErrors?.full_name}>
        <Input
          id="full_name"
          name="full_name"
          defaultValue={defaultName}
          autoComplete="name"
          maxLength={120}
          required
        />
      </Field>

      <Field
        label="Mobile number"
        htmlFor="mobile_number"
        required
        error={state.fieldErrors?.mobile_number}
        hint="Never shown on a listing. Revealed only to buyers who unlock your contact."
      >
        <div className="flex">
          <span className="inline-flex h-11 shrink-0 items-center rounded-l-field border border-r-0 border-ink-300 bg-ink-100 px-3.5 text-[0.9375rem] font-medium text-ink-600">
            +91
          </span>
          <Input
            id="mobile_number"
            name="mobile_number"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            defaultValue={defaultMobile}
            maxLength={15}
            className="rounded-l-none"
          />
        </div>
      </Field>

      <Field label="Email" htmlFor="email" hint="Managed by your Google account and cannot be changed here.">
        <Input id="email" value={email} readOnly disabled />
      </Field>

      <SubmitButton />
    </form>
  );
}
