import { createClient } from '@/lib/supabase/server';
import { getMyOrganizations, type OrganizationMembership } from '@/lib/organizations/queries';
import type { Tables } from '@/types/database.types';

export type Project = Tables<'projects'>;

/** A project with the company that owns it and the signed-in user's rights in it. */
export type ProjectRow = Project & {
  organizationName: string;
  organizationSlug: string;
  /**
   * Owner or admin. Carried because deleting a project is their decision alone
   * — both `deleteProject` and the `projects_delete_managers` policy say so.
   *
   * It was missing here, and the dashboard paid for it: with only the
   * inventory and marketing rights to hand, the delete button was gated on
   * `canManageInventory`, which includes a sales manager. They were shown a
   * Delete button, walked through a confirmation listing every unit and
   * enquiry it would destroy, and then told they were not allowed.
   */
  canManage: boolean;
  canManageMarketing: boolean;
  canManageInventory: boolean;
};

function decorate(project: Project, membership: OrganizationMembership): ProjectRow {
  return {
    ...project,
    organizationName: membership.organization.name,
    organizationSlug: membership.organization.slug,
    canManage: membership.canManage,
    canManageMarketing: membership.canManageMarketing,
    canManageInventory: membership.canManageInventory,
  };
}

/**
 * Every project across every company the user acts for.
 *
 * One list rather than a per-company view behind an org-switcher, matching the
 * single lead inbox: almost nobody runs more than one company, and the ones who
 * do would rather see everything than keep changing context. The company name
 * is on each row, so a mixed list is still legible.
 *
 * `projects_select_own` already restricts this to companies the caller is a
 * member of, so the `in` filter is a narrowing, not the security boundary.
 */
export async function getMyProjects(): Promise<ProjectRow[]> {
  const memberships = await getMyOrganizations();
  if (memberships.length === 0) return [];

  const byId = new Map(memberships.map((m) => [m.organization.id, m]));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .in('organization_id', [...byId.keys()])
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  return data.flatMap((project) => {
    const membership = byId.get(project.organization_id);
    return membership ? [decorate(project, membership)] : [];
  });
}

/**
 * One project, with the caller's rights resolved.
 *
 * Returns null both when the project does not exist and when the caller does
 * not act for its company — the two are the same answer from outside, and
 * distinguishing them would confirm a project exists to somebody with no
 * business knowing.
 */
export async function getMyProject(projectId: string): Promise<ProjectRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .maybeSingle();

  if (error || !data) return null;

  const memberships = await getMyOrganizations();
  const membership = memberships.find((m) => m.organization.id === data.organization_id);
  if (!membership) return null;

  return decorate(data, membership);
}

export type ProjectSummary = {
  total: number;
  published: number;
  drafts: number;
  unitsAvailable: number;
  leads: number;
};

/** Counters for the dashboard overview. All of them are denormalised columns. */
export async function getProjectSummary(): Promise<ProjectSummary> {
  const projects = await getMyProjects();

  return projects.reduce<ProjectSummary>(
    (acc, p) => ({
      total: acc.total + 1,
      published: acc.published + (p.is_published ? 1 : 0),
      drafts: acc.drafts + (p.is_published ? 0 : 1),
      unitsAvailable: acc.unitsAvailable + p.units_available,
      leads: acc.leads + p.leads_count,
    }),
    { total: 0, published: 0, drafts: 0, unitsAvailable: 0, leads: 0 },
  );
}
