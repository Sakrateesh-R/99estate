'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { completeProfile, type ProfileFormState } from '@/lib/profile/actions';

const INITIAL: ProfileFormState = { ok: false };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" fullWidth loading={pending}>
      {pending ? 'Saving…' : 'Save and continue'}
    </Button>
  );
}

export function CompleteProfileForm({
  defaultName,
  defaultMobile,
}: {
  defaultName: string;
  defaultMobile: string;
}) {
  const [state, formAction] = useActionState(completeProfile, INITIAL);

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
          placeholder="e.g. Priya Raman"
          required
          maxLength={120}
          aria-invalid={Boolean(state.fieldErrors?.full_name)}
        />
      </Field>

      <Field
        label="Mobile number"
        htmlFor="mobile_number"
        required
        error={state.fieldErrors?.mobile_number}
        hint="Shared only with people you choose to connect with. Never shown on a listing."
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
            placeholder="98765 43210"
            required
            maxLength={15}
            className="rounded-l-none"
            aria-invalid={Boolean(state.fieldErrors?.mobile_number)}
          />
        </div>
      </Field>

      <SubmitButton />
    </form>
  );
}
