'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getUser } from '@/lib/auth/session';

/**
 * §16 — lets the browser report a failure an admin can then read.
 *
 * Server errors land in the Vercel log. Browser errors land nowhere, which is
 * how view tracking stayed dead for weeks behind a bare `catch {}` and how one
 * photo in ten is still stored uncompressed without anyone knowing why.
 *
 * Reporting is best-effort by construction: every path returns rather than
 * throwing. A diagnostic that breaks the thing it is diagnosing is worse than
 * no diagnostic, and a seller must never see an upload fail because the
 * *logging* failed.
 */

const KINDS = ['image_compression', 'image_upload', 'payment', 'unexpected'] as const;

/**
 * Mirrors the CHECK constraints from migration 025.
 *
 * Deliberate duplication: the database is the authority, but a value rejected
 * there arrives as an opaque constraint violation. Checking here means an
 * over-long message is truncated and still recorded instead of being lost.
 */
const reportSchema = z.object({
  kind: z.enum(KINDS),
  message: z.string().trim().min(1).max(500),
  context: z.record(z.unknown()).default({}),
});

export type ClientErrorKind = (typeof KINDS)[number];

export async function reportClientError(input: {
  kind: ClientErrorKind;
  message: string;
  context?: Record<string, unknown>;
}): Promise<void> {
  try {
    const parsed = reportSchema.safeParse({
      kind: input.kind,
      // Truncate rather than reject: a long message is still a useful message.
      message: (input.message ?? '').slice(0, 500),
      context: input.context ?? {},
    });

    if (!parsed.success) return;

    const user = await getUser();
    // The RLS policy requires `user_id = auth.uid()`, so an anonymous report
    // has nowhere to go. Every surface that reports today is behind sign-in.
    if (!user) return;

    let context = parsed.data.context;
    if (JSON.stringify(context).length > 2000) {
      context = { truncated: true, note: 'context exceeded 2000 characters' };
    }

    const userAgent = (await headers()).get('user-agent')?.slice(0, 400) ?? null;

    const supabase = await createClient();
    await supabase.from('client_errors').insert({
      user_id: user.id,
      kind: parsed.data.kind,
      message: parsed.data.message,
      context: context as never,
      user_agent: userAgent,
    });
  } catch {
    // Swallowed on purpose, and the only `catch {}` in this codebase that is
    // allowed to stay silent: there is nowhere left to report a failure to
    // report a failure.
  }
}
