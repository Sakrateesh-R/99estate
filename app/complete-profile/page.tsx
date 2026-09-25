import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Lock, PhoneCall } from 'lucide-react';
import { Logo } from '@/components/layout/logo';
import { CompleteProfileForm } from '@/components/auth/complete-profile-form';
import { requireProfile } from '@/lib/auth/session';
import { readReturnTo } from '@/lib/auth/return-to';
import { DEFAULT_SIGNED_IN_PATH } from '@/lib/constants';

export const metadata: Metadata = {
  title: 'Complete your profile',
  robots: { index: false, follow: false },
};

/**
 * §5 — the one-step gate between signing in and using the marketplace.
 *
 * There is no OTP in the MVP; the number is captured, validated and stored.
 * Both sides of a deal need a way to reach each other, so this is mandatory
 * before posting a property or unlocking a contact.
 */
export default async function CompleteProfilePage() {
  const profile = await requireProfile();

  // Where the user was heading lives in the return-to cookie, not the URL.
  // Read (don't consume) it here — the form action is what clears it.
  const destination = (await readReturnTo()) ?? DEFAULT_SIGNED_IN_PATH;

  // Nothing to do — send them on.
  if (profile.is_profile_complete) redirect(destination);

  return (
    <div className="flex min-h-dvh flex-col bg-ink-50">
      <header className="border-b border-ink-200 bg-white">
        <div className="container-page flex h-16 items-center">
          <Logo />
        </div>
      </header>

      <main id="main" className="flex flex-1 items-center justify-center px-4 py-10 sm:py-16">
        <div className="w-full max-w-md">
          <div className="rounded-card border border-ink-200 bg-white p-6 shadow-card sm:p-8">
            <span className="grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-700">
              <PhoneCall className="size-6" aria-hidden />
            </span>

            <h1 className="mt-5 text-2xl font-bold tracking-tight">One last step</h1>
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-600">
              Add your mobile number so buyers and sellers can actually reach each other. You will
              need it before unlocking a contact or posting a property.
            </p>

            <div className="mt-7">
              <CompleteProfileForm
                defaultName={profile.full_name ?? ''}
                defaultMobile={profile.mobile_number ?? ''}
              />
            </div>
          </div>

          <div className="mt-5 flex items-start gap-2.5 px-2">
            <Lock className="mt-0.5 size-4 shrink-0 text-ink-400" aria-hidden />
            <p className="text-xs leading-relaxed text-ink-500">
              Your number stays private. It is never included in a listing, a search result or a
              public page — only a buyer who unlocks your contact ever sees it.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
