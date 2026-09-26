'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/session';
import { basicInfoSchema, locationSchema, mediaSchema } from '@/lib/properties/schema';
import { isValidIndianMobile, normaliseMobile } from '@/lib/format';
import type { ActionResult } from '@/lib/properties/actions';

/**
 * §12 — an admin lists a property on behalf of an owner, agent or builder.
 *
 * For onboarding over the counter: someone walks in or phones up, dictates
 * their details, and an admin puts the listing together for them.
 *
 * The listing still belongs to that person. `seller_id` is their profile, the
 * ₹9 unlock discloses their number, the lead is theirs, and moderation and the
 * 90-day clock apply exactly as they would to a self-posted listing. The only
 * thing this adds is who typed it in — `posted_by`.
 *
 * Two shapes of seller come out of this:
 *
 *   claimable    they gave an email. A real account is created, and if they
 *                ever sign in with Google on that address they inherit the
 *                listing and every enquiry it has produced.
 *   placeholder  they gave no email. The record exists so the listing can, but
 *                nobody can sign into it, so `is_placeholder` is set and their
 *                enquiries have to be relayed by the posting admin.
 */

/**
 * RFC 2606 reserves `.invalid` so that it can never resolve or accept mail,
 * which is exactly the guarantee wanted here: a synthesised address must not
 * be able to reach a real inbox, and must be obvious as synthetic to anyone
 * reading the row later.
 */
const PLACEHOLDER_EMAIL_DOMAIN = 'placeholder.invalid';

function placeholderEmail(mobile: string): string {
  return `owner.${mobile}@${PLACEHOLDER_EMAIL_DOMAIN}`;
}

const ownerSchema = z.object({
  owner_name: z
    .string()
    .trim()
    .min(2, 'Enter the name buyers will see')
    .max(120, 'That name is too long'),
  owner_mobile: z.preprocess(
    (v) => (typeof v === 'string' ? normaliseMobile(v) : v),
    z.string().refine(isValidIndianMobile, 'Enter a valid 10-digit Indian mobile number'),
  ),
  /**
   * Blank is a real answer, not a mistake — plenty of owners will not have an
   * email or will not want to give one. It is what decides whether the account
   * can ever be claimed, so the form says as much rather than nagging for it.
   */
  owner_email: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().trim().toLowerCase().email('That does not look like an email address').optional(),
  ),
  /** Set when the admin has been shown an existing match and accepted it. */
  confirm_seller_id: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().uuid().optional(),
  ),
});

const onBehalfSchema = ownerSchema
  .merge(
    basicInfoSchema.pick({
      listing_type: true,
      property_type: true,
      seller_type: true,
      title: true,
      price: true,
    }),
  )
  .merge(locationSchema.pick({ city: true, locality: true }))
  .merge(mediaSchema);

export type OnBehalfInput = z.input<typeof onBehalfSchema>;

export type MatchedSeller = {
  id: string;
  fullName: string | null;
  email: string;
  mobile: string | null;
  isPlaceholder: boolean;
  matchedOn: 'mobile' | 'email';
};

export type OnBehalfOutcome =
  | {
      kind: 'created';
      propertyId: string;
      sellerId: string;
      sellerWasCreated: boolean;
      claimable: boolean;
    }
  /**
   * Not an error. The number or address already belongs to somebody, and
   * silently posting under whoever that is would attach a stranger's listing to
   * a real account on a typo. The admin is shown who it is and asked.
   */
  | { kind: 'needs-confirmation'; seller: MatchedSeller };

function fail(error: string, fieldErrors?: Record<string, string>): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

function collect(issues: z.ZodIssue[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.join('.');
    if (key && !out[key]) out[key] = issue.message;
  }
  return out;
}

export async function createListingOnBehalf(
  raw: unknown,
): Promise<ActionResult<OnBehalfOutcome>> {
  const admin = await requireAdmin();

  const parsed = onBehalfSchema.safeParse(raw);
  if (!parsed.success) {
    return fail('Please fix the highlighted fields.', collect(parsed.error.issues));
  }
  const input = parsed.data;

  const supabase = await createClient();

  // --- Resolve the seller ---------------------------------------------------
  //
  // By mobile first, because that is the column with a unique index on it and
  // therefore the one that can actually collide. An admin re-listing for a
  // repeat client should land on the same record rather than a second one.
  const { data: byMobile, error: lookupError } = await supabase
    .from('profiles')
    .select('id, full_name, email, mobile_number, is_placeholder')
    .eq('mobile_number', input.owner_mobile)
    .maybeSingle();

  if (lookupError) return fail(lookupError.message);

  type SellerRow = {
    id: string;
    full_name: string | null;
    email: string;
    mobile_number: string | null;
    is_placeholder: boolean;
  };

  let match: { row: SellerRow; matchedOn: 'mobile' | 'email' } | null = byMobile
    ? { row: byMobile, matchedOn: 'mobile' }
    : null;

  if (!match && input.owner_email) {
    const { data: byEmail } = await supabase
      .from('profiles')
      .select('id, full_name, email, mobile_number, is_placeholder')
      .eq('email', input.owner_email)
      .maybeSingle();
    if (byEmail) match = { row: byEmail, matchedOn: 'email' };
  }

  let sellerId: string;
  let sellerWasCreated = false;

  if (match) {
    // The admin has to have seen who this is before the listing is attached.
    if (input.confirm_seller_id !== match.row.id) {
      return {
        ok: true,
        data: {
          kind: 'needs-confirmation',
          seller: {
            id: match.row.id,
            fullName: match.row.full_name,
            email: match.row.email,
            mobile: match.row.mobile_number,
            isPlaceholder: match.row.is_placeholder,
            matchedOn: match.matchedOn,
          },
        },
      };
    }
    sellerId = match.row.id;
  } else {
    const created = await createSellerRecord({
      fullName: input.owner_name,
      mobile: input.owner_mobile,
      email: input.owner_email,
      sellerType: input.seller_type,
    });
    if (!created.ok) return fail(created.error);

    sellerId = created.sellerId;
    sellerWasCreated = true;
  }

  // --- Create the listing ---------------------------------------------------
  //
  // Through the admin's own client, not the service role: `properties_insert_own`
  // now has an `is_admin()` branch, and that branch checks that the *seller's*
  // profile is complete — so a listing whose owner has no reachable number
  // cannot be created at all.
  const { data: property, error: insertError } = await supabase
    .from('properties')
    .insert({
      seller_id: sellerId,
      posted_by: admin.id,
      title: input.title,
      property_type: input.property_type,
      listing_type: input.listing_type,
      seller_type: input.seller_type,
      price: input.price,
      city: input.city,
      locality: input.locality,
      // Already canonicalised by mediaSchema, so the CHECK constraint will
      // accept it or the parse would have failed above.
      video_url: input.video_url,
      // A draft, like any other new listing. The admin finishes it in the same
      // wizard a seller uses, and it goes through the same moderation queue —
      // posting on someone's behalf is not a way to skip review.
      status: 'draft',
    })
    .select('id')
    .maybeSingle();

  if (insertError || !property) {
    /**
     * Undo the account if this call is what brought it into existence.
     * Otherwise a validation failure here leaves an orphan auth user holding
     * the owner's mobile number, and the unique index on that column would
     * then block every retry.
     */
    if (sellerWasCreated) {
      await createAdminClient().auth.admin.deleteUser(sellerId).catch(() => undefined);
    }
    return fail(insertError?.message ?? 'The listing could not be created.');
  }

  revalidatePath('/admin');
  revalidatePath('/admin/listings');
  revalidatePath('/admin/properties');

  return {
    ok: true,
    data: {
      kind: 'created',
      propertyId: property.id,
      sellerId,
      sellerWasCreated,
      claimable: Boolean(input.owner_email),
    },
  };
}

/**
 * Brings a seller into existence.
 *
 * The auth user needs the service role — creating one is not something a
 * session client can do, however privileged the session. No password is set:
 * a claimable account is meant to be entered through Google on the same
 * address, and a placeholder is not meant to be entered at all.
 */
async function createSellerRecord({
  fullName,
  mobile,
  email,
  sellerType,
}: {
  fullName: string;
  mobile: string;
  email?: string;
  sellerType: 'owner' | 'agent' | 'builder';
}): Promise<{ ok: true; sellerId: string } | { ok: false; error: string }> {
  const serviceClient = createAdminClient();
  const isPlaceholder = !email;

  const { data: created, error: createError } = await serviceClient.auth.admin.createUser({
    email: email ?? placeholderEmail(mobile),
    /**
     * Confirmed without sending anything. We are not going to email somebody
     * out of the blue because an admin typed their address, and an unconfirmed
     * address would not link to their Google identity later — which is the
     * whole point of collecting it.
     */
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (createError || !created.user) {
    return { ok: false, error: createError?.message ?? 'That account could not be created.' };
  }

  /**
   * `handle_new_user` has already inserted the profile from the auth row, so
   * this fills in what only the admin knows. Service role rather than the
   * admin's client because `is_placeholder` is pinned for everyone else, and
   * because this has to succeed or the account gets rolled back.
   */
  const { error: profileError } = await serviceClient
    .from('profiles')
    .update({
      full_name: fullName,
      mobile_number: mobile,
      // Matches how the listing describes them, so their next listing defaults
      // to the right thing and the admin user list reads correctly.
      role: sellerType,
      is_placeholder: isPlaceholder,
    })
    .eq('id', created.user.id);

  if (profileError) {
    await serviceClient.auth.admin.deleteUser(created.user.id).catch(() => undefined);
    return { ok: false, error: profileError.message };
  }

  return { ok: true, sellerId: created.user.id };
}
