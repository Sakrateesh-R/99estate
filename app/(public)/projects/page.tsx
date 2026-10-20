import type { Metadata } from 'next';
import Link from 'next/link';
import { LayoutGrid, Search } from 'lucide-react';
import { ProjectCard } from '@/components/project/project-card';
import { Input, Select } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { getProjectCities, getPublicProjects, type ProjectFilters } from '@/lib/projects/public';
import {
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_ORDER,
  PROJECT_TYPE_LABELS,
  SITE_NAME,
} from '@/lib/constants';
import { getSiteUrl } from '@/lib/env';
import { JsonLd, itemListJsonLd } from '@/lib/seo/json-ld';
import type { Enums } from '@/types/database.types';

const PROJECT_TYPES: Enums<'project_type'>[] = [
  'apartment',
  'villa',
  'independent_house',
  'plot',
  'commercial',
  'mixed_development',
];

type PageProps = {
  searchParams: Promise<{ city?: string; type?: string; status?: string; q?: string }>;
};

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const { city, type } = await searchParams;

  const what = type && isProjectType(type) ? PROJECT_TYPE_LABELS[type] : 'New projects';
  const where = city ? ` in ${city}` : ' in India';

  const title = `${what}${where} — builder projects and availability`;
  const description =
    `Browse ${what.toLowerCase()}${where} from builders and promoters. ` +
    `See configurations, prices and unit-by-unit availability free on ${SITE_NAME}.`;

  /**
   * Only the unfiltered index is canonical and indexable.
   *
   * Every filter combination is the same inventory behind a different query
   * string, which is how a site ends up competing with itself for one set of
   * results. The listing side solved this with real landing-page URLs; projects
   * do not have those yet, so until they do the filtered views point at the
   * bare index and ask not to be indexed.
   */
  const filtered = Boolean(city || type || (await searchParams).status || (await searchParams).q);

  return {
    title,
    description,
    alternates: { canonical: '/projects' },
    openGraph: { type: 'website', title, description, url: `${getSiteUrl()}/projects` },
    robots: filtered ? { index: false, follow: true } : undefined,
  };
}

function isProjectType(value: string): value is Enums<'project_type'> {
  return (PROJECT_TYPES as string[]).includes(value);
}

function isProjectStatus(value: string): value is Enums<'project_status'> {
  return (PROJECT_STATUS_ORDER as string[]).includes(value);
}

export default async function ProjectsIndexPage({ searchParams }: PageProps) {
  const raw = await searchParams;

  // Narrowed before they reach the query, so a hand-edited `?type=anything`
  // is ignored rather than returning nothing with no explanation.
  const filters: ProjectFilters = {
    city: raw.city?.trim() || undefined,
    type: raw.type && isProjectType(raw.type) ? raw.type : undefined,
    status: raw.status && isProjectStatus(raw.status) ? raw.status : undefined,
    q: raw.q?.trim() || undefined,
  };

  const [projects, cities] = await Promise.all([getPublicProjects(filters), getProjectCities()]);

  const hasFilters = Boolean(filters.city || filters.type || filters.status || filters.q);

  return (
    <div className="bg-ink-50">
      {projects.length > 0 ? (
        <JsonLd
          data={itemListJsonLd({
            name: 'Projects on 99Estate',
            paths: projects.map((p) => `/projects/${p.slug}`),
          })}
        />
      ) : null}

      <div className="container-page py-6 lg:py-8">
        <h1 className="text-2xl font-bold tracking-tight text-ink-950 sm:text-3xl">
          Builder projects
        </h1>
        <p className="mt-1.5 text-[0.9375rem] text-ink-600">
          Apartments, villas and plot layouts from builders and promoters — with prices and
          availability per unit.
        </p>

        {/* A plain GET form, so every filtered view is a real URL that can be
            shared, bookmarked and gone Back out of. No client state involved. */}
        <form method="GET" className="mt-6 rounded-card border border-ink-200 bg-white p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_11rem_11rem_11rem_auto]">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-400"
                aria-hidden
              />
              <Input
                name="q"
                defaultValue={filters.q ?? ''}
                placeholder="Project or locality"
                aria-label="Search projects"
                className="pl-10"
              />
            </div>

            <Select name="city" defaultValue={filters.city ?? ''} aria-label="City">
              <option value="">Any city</option>
              {cities.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </Select>

            <Select name="type" defaultValue={filters.type ?? ''} aria-label="Project type">
              <option value="">Any type</option>
              {PROJECT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {PROJECT_TYPE_LABELS[type]}
                </option>
              ))}
            </Select>

            <Select name="status" defaultValue={filters.status ?? ''} aria-label="Construction stage">
              <option value="">Any stage</option>
              {PROJECT_STATUS_ORDER.map((status) => (
                <option key={status} value={status}>
                  {PROJECT_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>

            <Button type="submit">Search</Button>
          </div>

          {hasFilters ? (
            <Link
              href="/projects"
              className="mt-3 inline-block text-sm font-medium text-brand-700 hover:underline"
            >
              Clear filters
            </Link>
          ) : null}
        </form>

        <p className="mt-6 text-sm text-ink-600" aria-live="polite">
          {projects.length === 0
            ? 'No projects match.'
            : `${projects.length} project${projects.length === 1 ? '' : 's'}`}
        </p>

        {projects.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={<LayoutGrid className="size-6" />}
              title={hasFilters ? 'Nothing matches those filters' : 'No projects listed yet'}
              description={
                hasFilters
                  ? 'Try a wider search — fewer filters, or a different city.'
                  : 'Builders are still being onboarded. Individual properties are listed and free to browse.'
              }
              action={
                <Link
                  href={hasFilters ? '/projects' : '/properties'}
                  className="text-sm font-semibold text-brand-700 hover:underline"
                >
                  {hasFilters ? 'Clear filters' : 'Browse properties'}
                </Link>
              }
            />
          </div>
        ) : (
          <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <li key={project.id}>
                <ProjectCard project={project} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
