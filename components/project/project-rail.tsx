import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { ProjectCard } from '@/components/project/project-card';
import type { PublicProject } from '@/lib/projects/public';

/**
 * Titled rail of projects for the home page.
 *
 * Mirrors `PropertyRail`'s layout exactly — a horizontal snap-scroller below
 * `sm`, a grid above it — because the two sit one after the other on the home
 * page and a rail that scrolled differently from the one above it would read as
 * a glitch rather than a distinction.
 *
 * There is deliberately no empty state. `PropertyRail` takes one because the
 * latest-listings rail is the only thing standing between a new marketplace and
 * a home page with no properties on it; projects have no such obligation, so
 * when there are none the section simply is not there. A heading announcing
 * "no projects yet" would spend the most valuable space on the page telling a
 * buyer about inventory we do not have.
 */
export function ProjectRail({
  title,
  description,
  projects,
  viewAllHref = '/projects',
  viewAllLabel = 'View all projects',
}: {
  title: string;
  description?: string;
  projects: PublicProject[];
  viewAllHref?: string;
  viewAllLabel?: string;
}) {
  if (projects.length === 0) return null;

  return (
    <section className="border-t border-ink-200 bg-white">
      <div className="container-page py-12 lg:py-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
            {description ? (
              <p className="mt-2 text-[0.9375rem] text-ink-600">{description}</p>
            ) : null}
          </div>

          <Link
            href={viewAllHref}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 transition-colors hover:text-brand-900"
          >
            {viewAllLabel}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>

        <ul className="scrollbar-none -mx-4 mt-6 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:px-0 lg:grid-cols-3 xl:grid-cols-4">
          {projects.map((project) => (
            <li key={project.id} className="w-[min(20rem,78%)] shrink-0 snap-start sm:w-auto sm:shrink">
              <ProjectCard project={project} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
