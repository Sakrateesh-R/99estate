'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUser } from '@/lib/auth/session';
import type { Enums } from '@/types/database.types';

/**
 * §6 / §8 — `unlockContact(propertyId)`.
 *
 * This action is a thin wrapper. Every decision that matters — is the user
 * allowed, do they already own this unlock, is it free, what does it cost —
 * is made by `request_contact_unlock()` inside Postgres, in one transaction,
 * under an advisory lock. The client passes a property id and nothing else:
 * there is no "isFree" flag and no amount to tamper with.
 */

export type UnlockOutcome =
  | {
      status: 'unlocked';
      wasFree: boolean;
      freeRemaining: number | null;
      resetsAt: string | null;
      seller: { name: string | null; mobile: string; sellerType: Enums<'user_role'> };
    }
  | { status: 'payment_required'; amount: number; currency: string; resetsAt: string | null }
  | { status: 'sign_in_required' }
  | { status: 'profile_incomplete' }
  | { status: 'own_listing' }
  | { status: 'unavailable' }
  | { status: 'error'; message: string };

type UnlockRpcResult = {
  ok?: boolean;
  code?: string;
  amount?: number;
  currency?: string;
  free_remaining?: number;
  resets_at?: string;
  is_free?: boolean;
  seller_name?: string | null;
  seller_mobile?: string | null;
  seller_type?: Enums<'user_role'>;
};

export async function unlockContact(propertyId: string): Promise<UnlockOutcome> {
  if (!propertyId) return { status: 'error', message: 'Missing property.' };

  const user = await getUser();
  if (!user) return { status: 'sign_in_required' };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('request_contact_unlock', {
    p_property_id: propertyId,
  });

  if (error) {
    return { status: 'error', message: error.message };
  }

  const result = (data ?? {}) as UnlockRpcResult;

  switch (result.code) {
    case 'unlocked_free':
    case 'already_unlocked': {
      if (!result.seller_mobile) {
        return { status: 'error', message: 'Contact could not be revealed. Please try again.' };
      }

      // The header quota pill and the dashboard both read the usage RPC.
      revalidatePath('/', 'layout');

      return {
        status: 'unlocked',
        wasFree: result.is_free ?? true,
        freeRemaining: result.free_remaining ?? null,
        resetsAt: result.resets_at ?? null,
        seller: {
          name: result.seller_name ?? null,
          mobile: result.seller_mobile,
          sellerType: result.seller_type ?? 'owner',
        },
      };
    }

    case 'payment_required':
      return {
        status: 'payment_required',
        amount: result.amount ?? 9,
        currency: result.currency ?? 'INR',
        resetsAt: result.resets_at ?? null,
      };

    case 'unauthenticated':
      return { status: 'sign_in_required' };
    case 'profile_incomplete':
      return { status: 'profile_incomplete' };
    case 'own_listing':
      return { status: 'own_listing' };
    case 'not_found':
    case 'unavailable':
      return { status: 'unavailable' };

    default:
      return { status: 'error', message: 'Something went wrong. Please try again.' };
  }
}

/**
 * Read-only state for the contact card on first paint.
 *
 * Returns the seller's number only when a settled unlock already exists — the
 * same RPC the unlock action uses, so the button label and the actual
 * behaviour can never disagree.
 */
export type ContactState = {
  code:
    | 'sign_in_required'
    | 'own_listing'
    | 'already_unlocked'
    | 'free_available'
    | 'payment_required'
    | 'profile_incomplete'
    | 'unavailable'
    | 'not_found';
  unlocked: boolean;
  requiresPayment: boolean;
  price: number;
  currency: string;
  freeLimit: number;
  freeRemaining: number | null;
  freeUsed: number | null;
  resetsAt: string | null;
  wasFree: boolean | null;
  seller: { name: string | null; mobile: string; sellerType: Enums<'user_role'> } | null;
};

export async function getContactState(propertyId: string): Promise<ContactState | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_contact_unlock_state', {
    p_property_id: propertyId,
  });

  if (error || !data) return null;

  const r = data as UnlockRpcResult & {
    unlocked?: boolean;
    requires_payment?: boolean;
    price?: number;
    free_limit?: number;
    free_used?: number;
    was_free?: boolean;
    is_own_listing?: boolean;
  };

  return {
    code: (r.code ?? 'not_found') as ContactState['code'],
    unlocked: r.unlocked ?? false,
    requiresPayment: r.requires_payment ?? false,
    price: r.price ?? 9,
    currency: r.currency ?? 'INR',
    freeLimit: r.free_limit ?? 2,
    freeRemaining: r.free_remaining ?? null,
    freeUsed: r.free_used ?? null,
    resetsAt: r.resets_at ?? null,
    wasFree: r.was_free ?? null,
    seller: r.seller_mobile
      ? {
          name: r.seller_name ?? null,
          mobile: r.seller_mobile,
          sellerType: r.seller_type ?? 'owner',
        }
      : null,
  };
}
