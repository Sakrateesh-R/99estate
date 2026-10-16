import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { getUser } from '@/lib/auth/session';
import type { Enums, Tables } from '@/types/database.types';

export type Organization = Tables<'organizations'>;
export type OrganizationMember = Tables<'organization_members'>;

/** A company plus what the signed-in user is allowed to do inside it. */
export type OrganizationMembership = {
  organization: Organization;
  role: Enums<'org_member_role'>;
  status: Enums<'org_member_status'>;
  /** Owner or admin: the team, the company profile, creating and deleting projects. */
  canManage: boolean;
  /** The above plus sales manager: inventory and leads. */
  canManageInventory: boolean;
  /** The above plus marketing: the project record, its media and its amenities. */
  canManageMarketing: boolean;
};

const MANAGE_ROLES: Enums<'org_member_role'>[] = ['owner', 'admin'];
const INVENTORY_ROLES: Enums<'org_member_role'>[] = ['owner', 'admin', 'sales_manager'];
const MARKETING_ROLES: Enums<'org_member_role'>[] = ['owner', 'admin', 'sales_manager', 'marketing'];

/**
 * Turns a role into the three rights the UI gates on.
 *
 * Deliberately mirrors `can_manage_org`, `can_manage_org_inventory` and
 * `can_manage_org_marketing` in the database rather than inventing a parallel
 * idea of permission. This copy decides what to *render*; those functions
 * decide what is *allowed*, and they are the ones that cannot be talked out of
 * it. Keeping the two in step matters, but only one of them is a defence.
 */
export function rightsFor(role: Enums<'org_member_role'>) {
  return {
    canManage: MANAGE_ROLES.includes(role),
    canManageInventory: INVENTORY_ROLES.includes(role),
    canManageMarketing: MARKETING_ROLES.includes(role),
  };
}

/**
 * Every company the signed-in user acts for.
 *
 * One query, not a membership lookup followed by a company lookup: the
 * embedded select is a single round trip and RLS filters it to the user's own
 * memberships anyway.
 *
 * Only `active` memberships count. An `invited` row means somebody has been
 * offered a seat and has not taken it, and a `suspended` one means it has been
 * withdrawn — neither should put a company in front of them.
 */
export const getMyOrganizations = cache(async (): Promise<OrganizationMembership[]> => {
  const user = await getUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('organization_members')
    .select('role, status, organizations (*)')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: true });

  if (error || !data) return [];

  return data.flatMap((row) => {
    // The embed is typed as possibly-null because the FK is nullable in the
    // generated types; a membership without a company cannot exist, but
    // narrowing here is cheaper than asserting.
    const organization = row.organizations as Organization | null;
    if (!organization) return [];

    return [
      {
        organization,
        role: row.role,
        status: row.status,
        ...rightsFor(row.role),
      },
    ];
  });
});

/**
 * The membership for one company, or null when the user does not act for it.
 *
 * Reads from `getMyOrganizations` rather than issuing its own query, so a page
 * that needs the list *and* one member of it still costs a single round trip.
 */
export async function getMyMembership(
  organizationId: string,
): Promise<OrganizationMembership | null> {
  const all = await getMyOrganizations();
  return all.find((m) => m.organization.id === organizationId) ?? null;
}

/**
 * The company to act on when the user has not named one.
 *
 * Almost everybody has exactly one. Returning it lets the dashboard skip an
 * org-switcher entirely for the common case while still being correct for
 * somebody who runs three.
 */
export async function getPrimaryOrganization(): Promise<OrganizationMembership | null> {
  const all = await getMyOrganizations();
  return all[0] ?? null;
}

export type TeamMember = {
  id: string;
  userId: string;
  role: Enums<'org_member_role'>;
  status: Enums<'org_member_status'>;
  name: string | null;
  avatarUrl: string | null;
  joinedAt: string;
  /** True for the signed-in user, who may not change their own role. */
  isYou: boolean;
};

/**
 * The team, for the company profile page.
 *
 * `profiles` is embedded through the membership's foreign key. A member can
 * read it because `organization_members_select` lets any member see the roster
 * — but note what is *not* selected: no email and no mobile number. Rule 8
 * reserves a phone number for a settled unlock, and a colleague's contact
 * details are not something this page needs in order to show who is on the
 * team.
 */
export async function getTeam(organizationId: string): Promise<TeamMember[]> {
  const user = await getUser();
  const supabase = await createClient();

  /**
   * The foreign key has to be named. `organization_members` points at
   * `profiles` twice — once as the member (`user_id`) and once as whoever
   * invited them (`invited_by`) — so an unhinted `profiles (...)` embed is
   * ambiguous and PostgREST refuses it. Without the hint this silently becomes
   * "who invited this person" on half the rows.
   */
  const { data, error } = await supabase
    .from('organization_members')
    .select(
      'id, user_id, role, status, created_at, profiles!organization_members_user_id_fkey (full_name, avatar_url)',
    )
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true });

  if (error || !data) return [];

  return data.map((row) => {
    const profile = row.profiles as { full_name: string | null; avatar_url: string | null } | null;
    return {
      id: row.id,
      userId: row.user_id,
      role: row.role,
      status: row.status,
      name: profile?.full_name ?? null,
      avatarUrl: profile?.avatar_url ?? null,
      joinedAt: row.created_at,
      isYou: row.user_id === user?.id,
    };
  });
}
