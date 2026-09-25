import type { Metadata } from 'next';
import Image from 'next/image';
import { ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ProfileForm } from '@/components/dashboard/profile-form';
import { requireProfile } from '@/lib/auth/session';
import { USER_ROLE_LABELS } from '@/lib/constants';
import { formatDate } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Profile',
  robots: { index: false, follow: false },
};

export default async function ProfilePage() {
  const profile = await requireProfile();

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Profile</h1>
      <p className="mt-1.5 text-[0.9375rem] text-ink-600">
        How you appear to buyers, and how they reach you once a contact is unlocked.
      </p>

      <Card className="mt-6">
        <CardHeader className="flex-row items-center gap-4">
          {profile.avatar_url ? (
            <Image
              src={profile.avatar_url}
              alt=""
              width={56}
              height={56}
              className="size-14 rounded-full object-cover ring-1 ring-ink-200"
            />
          ) : (
            <span className="grid size-14 place-items-center rounded-full bg-brand-700 text-xl font-semibold text-white">
              {(profile.full_name ?? profile.email).charAt(0).toUpperCase()}
            </span>
          )}

          <div className="min-w-0">
            <CardTitle className="truncate">{profile.full_name ?? 'Your account'}</CardTitle>
            <CardDescription className="mt-0.5 flex flex-wrap items-center gap-2">
              <Badge tone={profile.role === 'admin' ? 'brand' : 'neutral'}>
                {USER_ROLE_LABELS[profile.role]}
              </Badge>
              <span>Member since {formatDate(profile.created_at)}</span>
            </CardDescription>
          </div>
        </CardHeader>
      </Card>

      <Card className="mt-5">
        <CardHeader>
          <CardTitle>Your details</CardTitle>
          <CardDescription>
            A valid mobile number is required before posting a property or unlocking a contact.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm
            defaultName={profile.full_name ?? ''}
            defaultMobile={profile.mobile_number ?? ''}
            email={profile.email}
          />
        </CardContent>
      </Card>

      <div className="mt-5 flex items-start gap-3 rounded-card border border-ink-200 bg-white p-5">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand-700" aria-hidden />
        <div>
          <p className="text-sm font-semibold text-ink-900">Where your number appears</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-600">
            Nowhere public. It is not in your listings, not in search results, and not in the page
            source. A buyer sees it only after they unlock your contact — and that unlock shows up in
            your leads with their name and number too.
          </p>
        </div>
      </div>
    </div>
  );
}
