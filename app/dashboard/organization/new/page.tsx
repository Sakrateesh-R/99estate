import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { OrganizationForm } from '@/components/dashboard/organization-form';
import { createOrganization } from '@/lib/organizations/actions';
import { getMyOrganizations } from '@/lib/organizations/queries';
import { requireCompleteProfile } from '@/lib/auth/session';
import { MAX_ORGANIZATIONS_PER_USER } from '@/lib/constants';

export const metadata: Metadata = {
  title: 'Register your company',
  robots: { index: false, follow: false },
};

export default async function NewOrganizationPage() {
  /**
   * `requireCompleteProfile`, not `requireProfile`: the insert policy requires
   * `profile_is_complete()`, so somebody without a mobile number would fill in
   * this whole form only to be refused by the database. Sending them to finish
   * the profile first is the same rule, applied before the typing.
   */
  await requireCompleteProfile();

  // The cap is enforced in the guard trigger as well; this just avoids handing
  // somebody a form that cannot be submitted.
  const existing = await getMyOrganizations();
  if (existing.length >= MAX_ORGANIZATIONS_PER_USER) redirect('/dashboard/organization');

  return (
    <div>
      <Link
        href="/dashboard/organization"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-900"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to my company
      </Link>

      <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">Register your company</h1>
      <p className="mt-1.5 max-w-prose text-[0.9375rem] text-ink-600">
        Only the name and what you do are required — everything else can be filled in later. You
        will be the owner of the company and can add your team afterwards.
      </p>

      <Card className="mt-8">
        <CardContent>
          <OrganizationForm action={createOrganization} submitLabel="Register company" />
        </CardContent>
      </Card>
    </div>
  );
}
