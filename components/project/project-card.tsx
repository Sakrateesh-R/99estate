import Image from 'next/image';
import Link from 'next/link';
import { Building2, MapPin } from 'lucide-react';
import { Badge, EntityVerificationBadge, ProjectStatusBadge } from '@/components/ui/badge';
import { PROJECT_TYPE_LABELS } from '@/lib/constants';
import { formatPriceShort } from '@/lib/format';
import type { PublicProject } from '@/lib/projects/public';

/**
 * Builds "2 & 3 BHK Apartments" (§26).
 *
 * The configurations come from the builder's own declared list rather than from
 * the loaded inventory, so the card says what the brochure says even before a
 * single unit row exists.
 */
export function projectConfigurationLabel(project: PublicProject): string {
  const type = PROJECT_TYPE_LABELS[project.project_type];
  const bhk = [...project.bedroom_options].sort((a, b) => a - b);

  if (bhk.length === 0) return type;
  if (bhk.length === 1) return `${bhk[0]} BHK ${type}`;

  const last = bhk[bhk.length - 1];
  return `${bhk.slice(0, -1).join(', ')} & ${last} BHK ${type}`;
}

/** The declared range. "Price on request" is honest; a made-up number is not. */
export function projectPriceLabel(project: PublicProject): string {
  const { price_min: min, price_max: max } = project;
  if (min == null && max == null) return 'Price on request';
  if (min != null && max != null && min !== max) {
    return `${formatPriceShort(min)} – ${formatPriceShort(max)}`;
  }
  return formatPriceShort((min ?? max) as number);
}

export function ProjectCard({ project }: { project: PublicProject }) {
  const where = [project.locality, project.city].filter(Boolean).join(', ');

  return (
    <article className="group overflow-hidden rounded-card border border-ink-200 bg-white transition-shadow hover:shadow-md">
      <Link href={`/projects/${project.slug}`} className="block">
        <div className="relative aspect-[4/3] overflow-hidden bg-ink-100">
          {project.cover_image_url ? (
            <Image
              src={project.cover_image_url}
              alt=""
              fill
              sizes="(min-width: 1024px) 320px, (min-width: 640px) 45vw, 90vw"
              className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="grid h-full place-items-center text-ink-300">
              <Building2 className="size-8" aria-hidden />
            </div>
          )}

          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            <ProjectStatusBadge status={project.status} />
            {project.is_verified ? <EntityVerificationBadge status="verified" /> : null}
          </div>
        </div>

        <div className="p-4">
          <h3 className="truncate text-base font-semibold text-ink-900 group-hover:text-brand-700">
            {project.name}
          </h3>

          <p className="mt-1 truncate text-sm text-ink-600">{projectConfigurationLabel(project)}</p>

          {where ? (
            <p className="mt-1 flex items-center gap-1 truncate text-xs text-ink-500">
              <MapPin className="size-3.5 shrink-0" aria-hidden />
              {where}
            </p>
          ) : null}

          <p className="mt-2.5 text-[0.9375rem] font-bold text-ink-950">
            {projectPriceLabel(project)}
          </p>

          {/* Only shown once inventory exists. "0 of 0 available" on a project
              whose units have not been loaded reads as sold out. */}
          {project.units_total > 0 ? (
            <p className="mt-1.5 text-xs text-ink-500">
              {project.units_available > 0
                ? `${project.units_available} of ${project.units_total} available`
                : 'Fully booked'}
            </p>
          ) : project.total_units ? (
            <p className="mt-1.5 text-xs text-ink-500">{project.total_units} units</p>
          ) : null}
        </div>
      </Link>
    </article>
  );
}

/** Compact variant for the builder profile, where the company is already known. */
export function ProjectRowCard({ project }: { project: PublicProject }) {
  const where = [project.locality, project.city].filter(Boolean).join(', ');

  return (
    <Link
      href={`/projects/${project.slug}`}
      className="flex gap-3 rounded-card border border-ink-200 bg-white p-3 transition-colors hover:border-ink-300 hover:bg-ink-50"
    >
      <div className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-ink-100">
        {project.cover_image_url ? (
          <Image src={project.cover_image_url} alt="" fill sizes="80px" className="object-cover" />
        ) : (
          <div className="grid h-full place-items-center text-ink-300">
            <Building2 className="size-5" aria-hidden />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink-900">{project.name}</p>
        <p className="mt-0.5 truncate text-xs text-ink-500">{where}</p>
        <p className="mt-1 text-sm font-bold text-ink-950">{projectPriceLabel(project)}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <ProjectStatusBadge status={project.status} />
          {!project.is_published ? <Badge tone="neutral">Not live</Badge> : null}
        </div>
      </div>
    </Link>
  );
}
