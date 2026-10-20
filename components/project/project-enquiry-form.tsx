'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { CheckCircle2, Lock, Send } from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { submitProjectEnquiry, type EnquiryFormState } from '@/lib/projects/enquiry-actions';

const INITIAL: EnquiryFormState = { ok: false };

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending} fullWidth>
      <Send className="size-4" aria-hidden />
      {label}
    </Button>
  );
}

/**
 * §29, §30 — the enquiry form on a project page.
 *
 * It asks for a name and a number rather than reusing the ones on the account,
 * and that is the point rather than an oversight: Rule 8 reserves
 * `profiles.mobile_number` for a settled ₹9 unlock, so what the builder
 * receives is only ever what the buyer chose to type here. The hint under the
 * field says so, because a form that silently shared the account number would
 * be a different promise.
 *
 * Signing in is still required. An anonymous enquiry means a lead with no
 * buyer, which is a spam endpoint — so the signed-out state offers sign-in
 * instead of pretending to work.
 */
export function ProjectEnquiryForm({
  projectId,
  projectName,
  unit,
  isSignedIn,
  defaultName,
  returnTo,
  projectPath,
}: {
  projectId: string;
  projectName: string;
  /**
   * Set when enquiring about one specific unit, which §29 calls for.
   *
   * Resolved on the server from `?unit=`, not held as client state. The
   * inventory table is a separate component further down the page, and the two
   * would have needed a shared client boundary to agree — with the URL as the
   * single source there is nothing to disagree about, the choice survives a
   * reload, and the link is shareable.
   */
  unit?: { id: string; label: string } | null;
  isSignedIn: boolean;
  defaultName?: string | null;
  /** Where to come back to after signing in, and the path without `?unit=`. */
  returnTo: string;
  projectPath: string;
}) {
  const [state, formAction] = useActionState(submitProjectEnquiry, INITIAL);
  const unitId = unit?.id ?? '';

  if (state.received) {
    return (
      <div className="rounded-card border border-emerald-200 bg-emerald-50 px-5 py-6 text-center">
        <CheckCircle2 className="mx-auto size-8 text-emerald-600" aria-hidden />
        <p className="mt-3 text-base font-semibold text-emerald-900">Enquiry sent</p>
        <p className="mt-1 text-sm text-emerald-800">
          {projectName} has your details and will be in touch. You can see this in your enquiries.
        </p>
        <ButtonLink href="/dashboard/leads" variant="outline" size="sm" className="mt-4">
          View my enquiries
        </ButtonLink>
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="rounded-card border border-ink-200 bg-white px-5 py-6">
        <Lock className="size-5 text-ink-400" aria-hidden />
        <p className="mt-3 text-base font-semibold text-ink-900">Sign in to enquire</p>
        <p className="mt-1 text-sm text-ink-600">
          Send your details to {projectName} and track every enquiry in one place. Browsing stays
          free.
        </p>
        <ButtonLink href={`/login?next=${encodeURIComponent(returnTo)}`} fullWidth className="mt-4">
          Sign in to continue
        </ButtonLink>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="project_id" value={projectId} />
      {/* Carried in a hidden field rather than a prop so the unit chosen in the
          inventory table below is what gets sent. Empty means the whole
          project, which is a different lead source in the database. */}
      <input type="hidden" name="unit_id" value={unitId} />

      {state.error ? (
        <div
          role="alert"
          className="rounded-field border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
        >
          {state.error}
          {state.needsSignIn ? (
            <>
              {' '}
              <Link
                href={`/login?next=${encodeURIComponent(returnTo)}`}
                className="font-semibold underline underline-offset-2"
              >
                Sign in
              </Link>
            </>
          ) : null}
        </div>
      ) : null}

      {unit ? (
        <div className="flex items-center justify-between gap-2 rounded-field bg-brand-50 px-3.5 py-2.5 text-sm">
          <span className="min-w-0 truncate text-brand-900">
            Enquiring about <strong className="font-semibold">{unit.label}</strong>
          </span>
          <Link
            href={`${projectPath}#enquire`}
            className="shrink-0 text-xs font-semibold text-brand-700 underline underline-offset-2"
          >
            Whole project
          </Link>
        </div>
      ) : null}

      <Field label="Your name" htmlFor="contact_name" required error={state.fieldErrors?.contact_name}>
        <Input
          id="contact_name"
          name="contact_name"
          defaultValue={defaultName ?? ''}
          autoComplete="name"
          maxLength={120}
          required
        />
      </Field>

      <Field
        label="Your mobile number"
        htmlFor="contact_mobile"
        required
        error={state.fieldErrors?.contact_mobile}
        hint="Shared with this builder only. We never pass on the number on your account."
      >
        <div className="flex">
          <span className="inline-flex h-11 shrink-0 items-center rounded-l-field border border-r-0 border-ink-300 bg-ink-100 px-3.5 text-[0.9375rem] font-medium text-ink-600">
            +91
          </span>
          <Input
            id="contact_mobile"
            name="contact_mobile"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            maxLength={15}
            className="rounded-l-none"
            required
          />
        </div>
      </Field>

      <Field label="Message" htmlFor="message" error={state.fieldErrors?.message}>
        <Textarea
          id="message"
          name="message"
          rows={3}
          maxLength={2000}
          placeholder="When can I visit the site?"
        />
      </Field>

      <SubmitButton label={unitId ? 'Send enquiry about this unit' : 'Send enquiry'} />

      <p className="text-center text-xs text-ink-500">
        Free. Sending an enquiry does not use a contact unlock.
      </p>
    </form>
  );
}
