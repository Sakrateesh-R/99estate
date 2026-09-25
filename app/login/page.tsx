import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, Check, ShieldCheck } from 'lucide-react';
import { Logo } from '@/components/layout/logo';
import { GoogleSignInButton } from '@/components/auth/google-sign-in-button';
import { getUser } from '@/lib/auth/session';
import { readAuthError, readReturnTo } from '@/lib/auth/return-to';
import { DEFAULT_SIGNED_IN_PATH, FREE_DAILY_UNLOCKS, PAID_UNLOCK_PRICE } from '@/lib/constants';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to 99Estate to unlock seller contacts and manage your property listings.',
  robots: { index: false, follow: true },
};

const BENEFITS = [
  `${FREE_DAILY_UNLOCKS} seller contacts free, every single day`,
  `Only ₹${PAID_UNLOCK_PRICE} for each extra contact — never a subscription`,
  'Post unlimited properties for free',
  'Save listings and track every lead in one dashboard',
];

export default async function LoginPage() {
  // Middleware already bounces signed-in users, but a direct render (e.g. a
  // cached RSC payload) should not show a sign-in form to someone signed in.
  if (await getUser()) {
    redirect(await readReturnTo() ?? DEFAULT_SIGNED_IN_PATH);
  }

  // Both the destination and any error live in httpOnly cookies rather than
  // the URL, so this page has no query string at all.
  const error = await readAuthError();

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* ---- Form side ---- */}
      <div className="flex flex-col px-6 py-8 sm:px-10">
        <div className="flex items-center justify-between">
          <Logo />
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 transition-colors hover:text-ink-900"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back to site
          </Link>
        </div>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <h1 className="text-3xl font-bold tracking-tight">Welcome to 99Estate</h1>
          <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-ink-600">
            Browsing is always free. Sign in when you are ready to contact a seller or list a
            property of your own.
          </p>

          {error ? (
            <div
              role="alert"
              className="mt-6 rounded-field border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
            >
              {error}
            </div>
          ) : null}

          <div className="mt-8">
            <GoogleSignInButton />
          </div>

          <p className="mt-5 text-xs leading-relaxed text-ink-500">
            By continuing you agree to our{' '}
            <Link href="/terms" className="font-medium text-ink-700 underline underline-offset-2">
              Terms of use
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="font-medium text-ink-700 underline underline-offset-2">
              Privacy policy
            </Link>
            . We will ask for your mobile number next — sellers and buyers need a way to reach each
            other.
          </p>

          <div className="mt-8 flex items-start gap-2.5 rounded-field bg-ink-100/70 p-4">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand-700" aria-hidden />
            <p className="text-xs leading-relaxed text-ink-600">
              Your phone number is never shown on a listing. It is revealed only to a buyer who
              unlocks your contact — and to nobody else.
            </p>
          </div>
        </div>
      </div>

      {/* ---- Value side (desktop only) ---- */}
      <div className="relative hidden overflow-hidden bg-ink-950 lg:block">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'radial-gradient(60rem 40rem at 80% -10%, #0f8364 0%, transparent 60%), radial-gradient(40rem 30rem at 10% 110%, #b74806 0%, transparent 55%)',
          }}
          aria-hidden
        />
        <div className="relative flex h-full flex-col justify-center px-14 py-16 text-white">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent-300">
            Why 99Estate
          </p>
          <h2 className="mt-4 max-w-md text-4xl font-bold leading-tight text-white">
            The only property site that doesn&rsquo;t charge you to look.
          </h2>

          <ul className="mt-10 space-y-4">
            {BENEFITS.map((benefit) => (
              <li key={benefit} className="flex items-start gap-3">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-brand-500/20 text-brand-300">
                  <Check className="size-3.5" aria-hidden />
                </span>
                <span className="text-[0.9375rem] leading-relaxed text-ink-200">{benefit}</span>
              </li>
            ))}
          </ul>

          <div className="mt-12 max-w-sm rounded-card border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
            <p className="text-3xl font-bold tracking-tight text-white">
              ₹{PAID_UNLOCK_PRICE}
              <span className="ml-1.5 text-base font-medium text-ink-300">per extra contact</span>
            </p>
            <p className="mt-1.5 text-sm text-ink-300">
              No brokerage. No subscription. No charge to view a property.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
