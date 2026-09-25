'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getUser } from '@/lib/auth/session';

const REPORT_REASONS = [
  'fake_property',
  'duplicate',
  'wrong_price',
  'sold_property',
  'wrong_contact',
  'fraud',
  'spam',
  'misleading_information',
  'other',
] as const;

const reportSchema = z
  .object({
    propertyId: z.string().uuid(),
    reason: z.enum(REPORT_REASONS),
    description: z.string().trim().max(2000).optional(),
  })
  // Mirrors the CHECK constraint: "other" is unactionable without detail.
  .refine((v) => v.reason !== 'other' || (v.description?.length ?? 0) >= 10, {
    message: 'Please tell us what is wrong with this listing.',
    path: ['description'],
  });

export type ReportResult =
  | { status: 'submitted' }
  | { status: 'already_reported' }
  | { status: 'sign_in_required' }
  | { status: 'error'; message: string };

/** §17 — file a report. One open report per person per listing. */
export async function reportProperty(input: {
  propertyId: string;
  reason: string;
  description?: string;
}): Promise<ReportResult> {
  const user = await getUser();
  if (!user) return { status: 'sign_in_required' };

  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Please check the form.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('property_reports').insert({
    property_id: parsed.data.propertyId,
    reporter_id: user.id,
    reason: parsed.data.reason,
    description: parsed.data.description ?? null,
  });

  if (error) {
    if (error.code === '23505') return { status: 'already_reported' };
    // The guard trigger raises 42501 when someone reports their own listing.
    if (error.code === '42501') return { status: 'error', message: error.message };
    return { status: 'error', message: 'Could not submit the report. Please try again.' };
  }

  return { status: 'submitted' };
}
