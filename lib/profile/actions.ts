'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getUser } from '@/lib/auth/session';
import { consumeReturnTo } from '@/lib/auth/return-to';
import { normaliseMobile } from '@/lib/format';

export type ProfileFormState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Partial<Record<'full_name' | 'mobile_number', string>>;
};

const profileSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(2, 'Please enter your full name')
    .max(120, 'That name is too long'),
  mobile_number: z
    .string()
    .transform(normaliseMobile)
    .refine((v) => /^[6-9]\d{9}$/.test(v), 'Enter a valid 10-digit Indian mobile number'),
});

/**
 * §5 — completes the profile with the mandatory mobile number.
 *
 * The database mirrors every rule here (format CHECK, uniqueness index, and a
 * generated `is_profile_complete`), so a tampered request fails at the
 * database rather than silently creating an unreachable lead.
 */
export async function completeProfile(
  _prevState: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const user = await getUser();
  if (!user) return { ok: false, error: 'Your session expired. Please sign in again.' };

  const parsed = profileSchema.safeParse({
    full_name: formData.get('full_name') ?? '',
    mobile_number: formData.get('mobile_number') ?? '',
  });

  if (!parsed.success) {
    const fieldErrors: ProfileFormState['fieldErrors'] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key === 'full_name' || key === 'mobile_number') fieldErrors[key] = issue.message;
    }
    return { ok: false, fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: parsed.data.full_name,
      mobile_number: parsed.data.mobile_number,
    })
    .eq('id', user.id);

  if (error) {
    // 23505 = the partial unique index on profiles.mobile_number.
    if (error.code === '23505') {
      return {
        ok: false,
        fieldErrors: {
          mobile_number: 'This mobile number is already linked to another 99Estate account.',
        },
      };
    }
    return { ok: false, error: 'We could not save your details. Please try again.' };
  }

  // The destination came from the return-to cookie, not a form field or a
  // `?next=` parameter — consuming it here clears it so it cannot fire twice.
  const destination = await consumeReturnTo();

  revalidatePath('/', 'layout');
  redirect(destination);
}

const detailsSchema = profileSchema.partial({ mobile_number: true });

/** Profile edits from /dashboard/profile. Same validation, no redirect. */
export async function updateProfileDetails(
  _prevState: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const user = await getUser();
  if (!user) return { ok: false, error: 'Your session expired. Please sign in again.' };

  const raw = {
    full_name: formData.get('full_name') ?? '',
    ...(formData.get('mobile_number') ? { mobile_number: formData.get('mobile_number') } : {}),
  };

  const parsed = detailsSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: ProfileFormState['fieldErrors'] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key === 'full_name' || key === 'mobile_number') fieldErrors[key] = issue.message;
    }
    return { ok: false, fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('profiles').update(parsed.data).eq('id', user.id);

  if (error) {
    if (error.code === '23505') {
      return {
        ok: false,
        fieldErrors: { mobile_number: 'This mobile number is already linked to another account.' },
      };
    }
    return { ok: false, error: 'We could not save your changes. Please try again.' };
  }

  revalidatePath('/dashboard/profile');
  revalidatePath('/', 'layout');
  return { ok: true };
}
