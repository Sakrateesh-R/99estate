import type { Metadata } from 'next';
import Link from 'next/link';
import { Building2, ExternalLink, Plus, Users } from 'lucide-react';
import { Badge, EntityVerificationBadge } from '@/components/ui/badge';
import { TeamManager } from '@/components/dashboard/team-manager';
import { ButtonLink } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { OrganizationForm } from '@/components/dashboard/organization-form';
import { requireProfile } from '@/lib/auth/session';
import { updateOrganization } from '@/lib/organizations/actions';
import {
  getMyOrganizations,
  getTeam,
  getPendingInvitations,
  type OrganizationMembership,
} from '@/lib/organizations/queries';
import { ORGANIZATION_TYPE_LABELS, ORG_MEMBER_ROLE_LABELS } from '@/lib/constants';
import { formatDate } from '@/lib/format';

export const metadata: Metadata = {
  title: 'My company',
  robots: { index: false, follow: false },
};

export default async function OrganizationPage() {
  await requireProfile();
  const memberships = await getMyOrganizations();

  if (memberships.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">My company</h1>
        <p className="mt-1.5 text-[0.9375rem] text-ink-600">
          Register your company to list projects instead of one property at a time.
        </p>

        <div className="mt-8">
          <EmptyState
            icon={<Building2 className="size-6" />}
            title="You have not registered a company yet"
            description="Builders, promoters and agencies get a public profile, project pages with their own inventory, and one shared enquiry inbox for the whole team."
            action={
              <ButtonLink href="/dashboard/organization/new">Register your company</ButtonLink>
            }
          />
        </div>
      </div>
    );
  }

  /**
   * The common case is exactly one company, so this renders it directly rather
   * than behind a picker. Somebody who runs several gets every one stacked —
   * still no switcher, because a switcher hides the thing it switches away
   * from, and three companies is not enough to be worth that.
   */
  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {memberships.length === 1 ? 'My company' : 'My companies'}
          </h1>
          <p className="mt-1.5 text-[0.9375rem] text-ink-600">
            Your public profile, and who can act for you.
          </p>
        </div>

        {memberships.length < 3 ? (
          <ButtonLink href="/dashboard/organization/new" variant="outline">
            <Plus className="size-4" aria-hidden />
            Add another
          </ButtonLink>
        ) : null}
      </div>

      {memberships.map((membership) => (
        <OrganizationSection key={membership.organization.id} membership={membership} />
      ))}
    </div>
  );
}

/**
 * One company: its header, its team and its editable profile.
 *
 * A separate async component rather than an `async` callback inside `.map`,
 * which would hand JSX an array of promises. Each one fetches its own team, so
 * a builder with three companies gets three parallel reads rather than a
 * sequential loop.
 */
async function OrganizationSection({ membership }: { membership: OrganizationMembership }) {
  const { organization, role, canManage } = membership;
  // Both feed the team panel and neither depends on the other.
  const [team, invitations] = await Promise.all([
    getTeam(organization.id),
    getPendingInvitations(organization.id),
  ]);

  return (
    <section className="space-y-6">
            <Card>
              <CardHeader className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="truncate">{organization.name}</CardTitle>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <EntityVerificationBadge status={organization.verification_status} />
                    {organization.org_types.map((type) => (
                      <Badge key={type}>{ORGANIZATION_TYPE_LABELS[type]}</Badge>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <Badge tone="brand">You are {ORG_MEMBER_ROLE_LABELS[role].toLowerCase()}</Badge>
                  {/* Only worth linking once the page actually exists publicly:
                      a suspended company is not reachable there. */}
                  {organization.verification_status !== 'suspended' ? (
                    <Link
                      href={`/builders/${organization.slug}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
                    >
                      View public profile
                      <ExternalLink className="size-3" aria-hidden />
                    </Link>
                  ) : null}
                </div>
              </CardHeader>

              {organization.verification_status === 'suspended' ? (
                <CardContent>
                  <div
                    role="alert"
                    className="rounded-field border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                  >
                    <p className="font-semibold">This company is suspended.</p>
                    <p className="mt-1">
                      Its projects have been taken off the market.
                      {organization.admin_notes ? ` ${organization.admin_notes}` : ''}
                    </p>
                  </div>
                </CardContent>
              ) : null}

              <CardContent>
                <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Stat label="Projects" value={organization.projects_count} />
                  <Stat
                    label="Established"
                    value={organization.established_year ?? '—'}
                  />
                  <Stat label="RERA" value={organization.rera_number ?? '—'} />
                  <Stat label="Member since" value={formatDate(organization.created_at)} />
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="size-4 text-ink-400" aria-hidden />
                  Team
                </CardTitle>
              </CardHeader>
              <CardContent>
                <TeamManager
                  organizationId={organization.id}
                  members={team}
                  invitations={invitations}
                  canManage={canManage}
                  myRole={role}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Company profile</CardTitle>
              </CardHeader>
              <CardContent>
                {canManage ? (
                  <OrganizationForm action={updateOrganization} organization={organization} />
                ) : (
                  <p className="text-sm text-ink-600">
                    Only an owner or admin can change the company profile. You are signed in as{' '}
                    {ORG_MEMBER_ROLE_LABELS[role].toLowerCase()}.
                  </p>
                )}
              </CardContent>
            </Card>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-semibold text-ink-900">{value}</dd>
    </div>
  );
}
