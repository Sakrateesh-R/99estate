import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { ImageIcon, LayoutGrid, Plus, Users } from 'lucide-react';
import {
  Badge,
  EntityVerificationBadge,
  ProjectStatusBadge,
} from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { requireProfile } from '@/lib/auth/session';
import { getMyOrganizations } from '@/lib/organizations/queries';
import { getMyProjects, type ProjectRow } from '@/lib/projects/queries';
import { PROJECT_TYPE_LABELS } from '@/lib/constants';
import { formatCount, formatPriceShort } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Projects',
  robots: { index: false, follow: false },
};

export default async function ProjectsPage() {
  await requireProfile();

  const [memberships, projects] = await Promise.all([getMyOrganizations(), getMyProjects()]);

  /**
   * No company is no longer a blocker, so this no longer sends people away to
   * register one. Adding the first project creates the company record behind
   * the scenes; the useful next step here is the project itself.
   */
  if (memberships.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Projects</h1>
        <div className="mt-8">
          <EmptyState
            icon={<LayoutGrid className="size-6" />}
            title="No projects yet"
            description="A project is a development you are building and selling — a layout, an apartment block, a villa community. Add the details, then its photos and video."
            action={
              <ButtonLink href="/dashboard/projects/new">
                <Plus className="size-4" aria-hidden />
                Add project
              </ButtonLink>
            }
          />
        </div>
      </div>
    );
  }

  const canCreate = memberships.some((m) => m.canManage);
  const showCompany = memberships.length > 1;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Projects</h1>
          <p className="mt-1.5 text-[0.9375rem] text-ink-600">
            {projects.length === 0
              ? 'No projects yet.'
              : `${projects.length} project${projects.length === 1 ? '' : 's'}.`}
          </p>
        </div>

        {canCreate ? (
          <ButtonLink href="/dashboard/projects/new">
            <Plus className="size-4" aria-hidden />
            Add project
          </ButtonLink>
        ) : null}
      </div>

      {projects.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<LayoutGrid className="size-6" />}
            title="Add your first project"
            description="A project gets its own page, its own inventory of units or plots, and sends every enquiry to your team's shared inbox."
            action={
              canCreate ? (
                <ButtonLink href="/dashboard/projects/new">Add a project</ButtonLink>
              ) : (
                <p className="text-sm text-ink-500">
                  Only an owner or admin of your company can add a project.
                </p>
              )
            }
          />
        </div>
      ) : (
        <>
          {/* Cards below `lg`, a real table above it — same split as the
              listings table, where the extra columns only fit on a wide
              viewport. */}
          <ul className="mt-8 space-y-4 lg:hidden">
            {projects.map((project) => (
              <li key={project.id} className="rounded-card border border-ink-200 bg-white p-4">
                <div className="flex gap-3">
                  <Cover project={project} className="size-20" />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/dashboard/projects/${project.id}/edit`}
                      className="block truncate text-sm font-semibold text-ink-900 hover:text-brand-700"
                    >
                      {project.name}
                    </Link>
                    <p className="mt-0.5 truncate text-xs text-ink-500">
                      {[project.locality, project.city].filter(Boolean).join(', ')}
                    </p>
                    {showCompany ? (
                      <p className="mt-0.5 truncate text-[0.6875rem] text-ink-400">
                        {project.organizationName}
                      </p>
                    ) : null}
                    <p className="mt-1 text-sm font-bold text-ink-950">
                      <PriceRange project={project} />
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <LiveBadge project={project} />
                      <ProjectStatusBadge status={project.status} />
                      <EntityVerificationBadge status={project.verification_status} />
                    </div>
                  </div>
                </div>

                <dl className="mt-3 grid grid-cols-4 gap-2 border-t border-ink-100 pt-3 text-center">
                  <MiniStat label="Units" value={project.units_total} />
                  <MiniStat label="Available" value={project.units_available} />
                  <MiniStat label="Sold" value={project.units_sold} />
                  <MiniStat
                    label="Enquiries"
                    value={project.leads_count}
                    href={
                      project.leads_count > 0 ? `/dashboard/leads?project=${project.id}` : undefined
                    }
                  />
                </dl>
              </li>
            ))}
          </ul>

          <div className="mt-8 hidden overflow-x-auto rounded-card border border-ink-200 bg-white lg:block">
            <table className="w-full min-w-[58rem] text-sm">
              <caption className="sr-only">Your projects and their inventory</caption>
              <thead>
                <tr className="border-b border-ink-200 bg-ink-50 text-left text-xs uppercase tracking-wide text-ink-500">
                  <th scope="col" className="px-3 py-3 font-semibold">Project</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Stage</th>
                  <th scope="col" className="px-2.5 py-3 text-right font-semibold">Units</th>
                  <th scope="col" className="px-2.5 py-3 text-right font-semibold">Available</th>
                  <th scope="col" className="px-2.5 py-3 text-right font-semibold">Sold</th>
                  <th scope="col" className="px-2.5 py-3 text-right font-semibold">
                    <span className="inline-flex items-center gap-1">
                      <Users className="size-3.5" aria-hidden />
                      Enquiries
                    </span>
                  </th>
                  {/* `w-px` + nowrap is the table idiom for "exactly as wide as
                      its content", so this column is not the one squeezed when
                      a long locality stretches the first. */}
                  <th scope="col" className="w-px whitespace-nowrap px-3 py-3 text-right font-semibold">
                    Visibility
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {projects.map((project) => (
                  <tr key={project.id} className="transition-colors hover:bg-ink-50/60">
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <Cover project={project} className="size-12" />
                        <div className="min-w-0 max-w-[19rem]">
                          <Link
                            href={`/dashboard/projects/${project.id}/edit`}
                            className="block truncate font-semibold text-ink-900 hover:text-brand-700"
                          >
                            {project.name}
                          </Link>
                          <p className="truncate text-xs text-ink-500">
                            {PROJECT_TYPE_LABELS[project.project_type]} ·{' '}
                            {[project.locality, project.city].filter(Boolean).join(', ')}
                          </p>
                          <p className="truncate text-xs text-ink-500">
                            <PriceRange project={project} />
                            {showCompany ? ` · ${project.organizationName}` : ''}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-3 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <ProjectStatusBadge status={project.status} />
                        <EntityVerificationBadge status={project.verification_status} />
                      </div>
                    </td>

                    <td className="px-2.5 py-3 text-right tabular-nums text-ink-700">
                      {/* The brochure figure and the loaded inventory are
                          different numbers, and a builder needs to see both —
                          "120 declared, 2 loaded" is the state of the work. */}
                      {formatCount(project.units_total)}
                      {project.total_units && project.total_units !== project.units_total ? (
                        <span className="block text-[0.6875rem] text-ink-400">
                          of {formatCount(project.total_units)}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-2.5 py-3 text-right tabular-nums text-ink-700">
                      {formatCount(project.units_available)}
                    </td>
                    <td className="px-2.5 py-3 text-right tabular-nums text-ink-700">
                      {formatCount(project.units_sold)}
                    </td>
                    <td className="px-2.5 py-3 text-right tabular-nums font-semibold text-ink-900">
                      {project.leads_count > 0 ? (
                        <Link
                          href={`/dashboard/leads?project=${project.id}`}
                          className="text-brand-700 hover:underline"
                        >
                          {formatCount(project.leads_count)}
                        </Link>
                      ) : (
                        formatCount(project.leads_count)
                      )}
                    </td>

                    <td className="w-px whitespace-nowrap px-3 py-3 text-right">
                      <LiveBadge project={project} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Cover({ project, className }: { project: ProjectRow; className?: string }) {
  return (
    <div className={`relative shrink-0 overflow-hidden rounded-lg bg-ink-100 ${className ?? ''}`}>
      {project.cover_image_url ? (
        <Image src={project.cover_image_url} alt="" fill sizes="80px" className="object-cover" />
      ) : (
        <div className="grid h-full place-items-center text-ink-300">
          <ImageIcon className="size-5" aria-hidden />
        </div>
      )}
    </div>
  );
}

/**
 * Whether the page is public — distinct from the construction stage, which is
 * how far the building has got. A completed, sold-out project can and should
 * stay live (§18), so these two never collapse into one badge.
 */
function LiveBadge({ project }: { project: ProjectRow }) {
  return project.is_published ? (
    <Badge tone="success">Live</Badge>
  ) : (
    <Badge tone="neutral">Draft</Badge>
  );
}

function PriceRange({ project }: { project: ProjectRow }) {
  const { price_min: min, price_max: max } = project;
  if (min == null && max == null) return <>Price on request</>;
  if (min != null && max != null && min !== max) {
    return (
      <>
        {formatPriceShort(min)} – {formatPriceShort(max)}
      </>
    );
  }
  return <>{formatPriceShort((min ?? max) as number)}</>;
}

function MiniStat({ label, value, href }: { label: string; value: number; href?: string }) {
  return (
    <div>
      <dt className="text-[0.6875rem] text-ink-500">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums text-ink-900">
        {href ? (
          <Link href={href} className="text-brand-700 hover:underline">
            {formatCount(value)}
          </Link>
        ) : (
          formatCount(value)
        )}
      </dd>
    </div>
  );
}
