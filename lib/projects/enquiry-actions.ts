'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth/session';
import { normaliseMobile } from '@/lib/format';

export type EnquiryFormState = {
  ok: boolean;
  /** Set on success so the form can replace itself with an acknowledgement. */
  received?: boolean;
  error?: string;
  /** Signals the UI to offer sign-in rather than show an error. */
  needsSignIn?: boolean;
  fieldErrors?: Partial<Record<'contact_name' | 'contact_mobile' | 'message', string>>;
};

const enquirySchema = z.object({
  contact_name: z
    .string()
    .trim()
    .min(2, 'Tell the builder your name')
    .max(120, 'That name is too long'),
  contact_mobile: z
    .string()
    .transform(normaliseMobile)
    .refine((v) => /^[6-9]\d{9}$/.test(v), 'Enter a valid 10-digit Indian mobile number'),
  message: z.preprocess(
    (v) => (v === null || (typeof v === 'string' && v.trim() === '') ? undefined : v),
    z.string().trim().max(2000, 'Keep your message under 2,000 characters').optional(),
  ),
});

/**
 * §29 — sends an enquiry about a project or one of its units.
 *
 * Everything that matters happens inside `submit_project_enquiry`, which is
 * SECURITY DEFINER. This action validates, calls it, and translates its result
 * code into a sentence. It deliberately does not insert a lead itself: the RPC
 * resolves which company owns the project (so the client cannot choose),
 * notifies that company's managers, and is idempotent under a double submit.
 *
 * Note the privacy shape. The name and number collected here are stored on the
 * lead and are the *only* contact the builder gets. Rule 8 reserves
 * `profiles.mobile_number` for a settled ₹9 unlock, so an enquiry does not
 * disclose the number on the buyer's account — only what they chose to type.
 */
export async function submitProjectEnquiry(
  _prevState: EnquiryFormState,
  formData: FormData,
): Promise<EnquiryFormState> {
  const projectId = String(formData.get('project_id') ?? '');
  if (!projectId) return { ok: false, error: 'Something went wrong. Please reload the page.' };

  const rawUnitId = String(formData.get('unit_id') ?? '').trim();
  const unitId = rawUnitId === '' ? null : rawUnitId;

  /**
   * Checked before validating, so a signed-out visitor is asked to sign in
   * rather than told their perfectly good phone number is wrong. The RPC is
   * revoked from `anon` as well as from PUBLIC, so without a session it returns
   * 42501 rather than a tidy code — this is the readable version of that.
   */
  const profile = await getProfile();
  if (!profile) {
    return {
      ok: false,
      needsSignIn: true,
      error: 'Sign in to send an enquiry — it takes a moment and keeps your details yours.',
    };
  }

  const parsed = enquirySchema.safeParse({
    contact_name: formData.get('contact_name') ?? '',
    contact_mobile: formData.get('contact_mobile') ?? '',
    message: formData.get('message'),
  });

  if (!parsed.success) {
    const fieldErrors: EnquiryFormState['fieldErrors'] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key === 'contact_name' || key === 'contact_mobile' || key === 'message') {
        fieldErrors[key] ??= issue.message;
      }
    }
    return { ok: false, fieldErrors };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('submit_project_enquiry', {
    p_project_id: projectId,
    p_unit_id: unitId,
    p_contact_name: parsed.data.contact_name,
    p_contact_mobile: parsed.data.contact_mobile,
    p_message: parsed.data.message ?? null,
  });

  if (error) {
    // The grant-level refusal, which is what an expired session looks like.
    if (error.code === '42501') {
      return {
        ok: false,
        needsSignIn: true,
        error: 'Your session expired. Please sign in again to send your enquiry.',
      };
    }
    return { ok: false, error: 'We could not send your enquiry. Please try again.' };
  }

  const result = data as { ok?: boolean; code?: string } | null;

  if (result?.ok) {
    // The builder's own dashboard count changes, and so does the project's.
    revalidatePath('/dashboard/leads');
    return { ok: true, received: true };
  }

  switch (result?.code) {
    case 'sign_in_required':
      return { ok: false, needsSignIn: true, error: 'Please sign in to send an enquiry.' };
    case 'mobile_invalid':
      return {
        ok: false,
        fieldErrors: { contact_mobile: 'Enter a valid 10-digit Indian mobile number' },
      };
    case 'name_required':
      return { ok: false, fieldErrors: { contact_name: 'Tell the builder your name' } };
    case 'project_unavailable':
      return { ok: false, error: 'This project is no longer accepting enquiries.' };
    case 'unit_not_in_project':
      return { ok: false, error: 'That unit is not part of this project. Please reload the page.' };
    /**
     * A member enquiring about their own company's project would put a lead in
     * their own inbox. The page hides the form in that case, so reaching this
     * means the membership changed mid-session.
     */
    case 'own_project':
      return { ok: false, error: 'This is your own project — enquiries come to you.' };
    default:
      return { ok: false, error: 'We could not send your enquiry. Please try again.' };
  }
}
