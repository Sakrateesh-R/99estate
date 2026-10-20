import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { after } from 'next/server';
import {
  BadgeCheck,
  Building2,
  CalendarDays,
  ChevronRight,
  Eye,
  LayoutGrid,
  MapPin,
  Maximize2,
  Sparkles,
} from 'lucide-react';
import { ProjectEnquiryForm } from '@/components/project/project-enquiry-form';
import { UnitTable } from '@/components/project/unit-table';
import { projectConfigurationLabel, projectPriceLabel } from '@/components/project/project-card';
import {
  Badge,
  EntityVerificationBadge,
  ProgressSourceBadge,
  ProjectStatusBadge,
} from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { getProjectDetail, prepareProjectViewTracking } from '@/lib/projects/public';
import { getAuthContext } from '@/lib/auth/session';
import { areaEmbedUrl, mapsLinkFor, parseMapUrl, pointEmbedUrl } from '@/lib/properties/map-link';
import { formatCount, formatDate } from '@/lib/format';
import {
  AREA_UNIT_LABELS,
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
  SITE_NAME,
} from '@/lib/constants';
import { getSiteUrl } from '@/lib/env';
import { JsonLd, breadcrumbJsonLd } from '@/lib/seo/json-ld';
import { projectMetaDescription } from '@/lib/seo/meta';

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ unit?: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await getProjectDetail(slug);

  if (!data) return { title: 'Project not found', robots: { index: false, follow: false } };

  const { project, builder } = data;
  const where = [project.locality, project.city].filter(Boolean).join(', ');
  const title = `${project.name} — ${projectConfigurationLabel(project)} in ${where}`;
  const canonical = `/projects/${project.slug}`;
  const ogImage = project.cover_image_url;

  return {
    title,
    description: projectMetaDescription(project, builder?.name ?? null),
    alternates: { canonical },
    openGraph: {
      type: 'website',
      title,
      description: projectMetaDescription(project, builder?.name ?? null),
      url: `${getSiteUrl()}${canonical}`,
      images: ogImage ? [{ url: ogImage, width: 1200, height: 750, alt: project.name }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: projectMetaDescription(project, builder?.name ?? null),
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

/**
 * §5, §26–§30 — the public project page.
 *
 * Reachable without a session, like every listing page. The one thing that
 * needs one is sending an enquiry, because a lead with no buyer is a spam
 * endpoint — and §18 means this page has no expiry: a completed, sold-out
 * project stays here as the builder's track record.
 */
export default async function ProjectDetailPage({ params, searchParams }: PageProps) {
  const [{ slug }, { unit: unitParam }] = await Promise.all([params, searchParams]);

  const data = await getProjectDetail(slug);
  if (!data) notFound();

  const { project, builder, units, media, amenities, isOwnProject } = data;
  const { profile, isSignedIn } = await getAuthContext();

  // Counted after the response has gone; the task touches no request API.
  after(await prepareProjectViewTracking(project.id));

  const projectPath = `/projects/${project.slug}`;
  const where = [project.locality, project.city, project.state].filter(Boolean).join(', ');

  /**
   * The unit named in `?unit=`, if it is real and still available.
   *
   * Validated against the rows actually loaded rather than trusted: a stale or
   * hand-edited link must not put a unit id on a lead that the RPC would then
   * reject with `unit_not_in_project`.
   */
  const selectedUnit = unitParam
    ? (units.find((u) => u.id === unitParam && u.status === 'available') ?? null)
    : null;

  const gallery = media.filter((m) => m.type === 'cover' || m.type === 'gallery');
  const floorPlans = media.filter((m) => m.type === 'floor_plan' || m.type === 'master_plan');
  const brochure = media.find((m) => m.type === 'brochure');
  /**
   * The exact pin, unlike a listing.
   *
   * A listing's map is deliberately coarse until the ₹9 unlock, because the
   * precise address is what the unlock buys. A project has no such bargain —
   * the builder wants site visits, the address is on their own hoarding, and
   * there is no `contact_unlocks` row anywhere in this flow. So the pin is
   * shown when we have one, and the locality is the fallback.
   *
   * The `src` is still built from our own values and never from the link the
   * builder pasted. That value stays provenance only, so no project can put
   * arbitrary content in a frame on a page carrying our name.
   */
  const point = parseMapUrl(project.map_url);
  const embed = point
    ? pointEmbedUrl(point)
    : project.city
      ? areaEmbedUrl({ locality: project.locality, city: project.city, state: project.state })
      : null;

  return (
    <div className="bg-ink-50">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Projects', path: '/projects' },
          { name: project.name, path: projectPath },
        ])}
      />

      <div className="container-page py-6 lg:py-8">
        <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1 text-xs text-ink-500">
          <Link href="/" className="hover:text-ink-800">Home</Link>
          <ChevronRight className="size-3" aria-hidden />
          <Link href="/projects" className="hover:text-ink-800">Projects</Link>
          <ChevronRight className="size-3" aria-hidden />
          <span className="truncate text-ink-700">{project.name}</span>
        </nav>

        {isOwnProject ? (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-card border border-brand-200 bg-brand-50 px-4 py-3">
            <p className="text-sm text-brand-900">
              This is your company&rsquo;s project. Enquiries come to your team&rsquo;s inbox.
            </p>
            <ButtonLink
              href={`/dashboard/projects/${project.id}/edit`}
              variant="outline"
              size="sm"
            >
              Edit project
            </ButtonLink>
          </div>
        ) : null}

        {/* ---- Hero ------------------------------------------------------- */}
        <div className="overflow-hidden rounded-card border border-ink-200 bg-white">
          <div className="relative aspect-[16/9] bg-ink-100 sm:aspect-[21/9]">
            {project.cover_image_url ? (
              <Image
                src={project.cover_image_url}
                alt={project.name}
                fill
                priority
                sizes="(min-width: 1024px) 1024px, 100vw"
                className="object-cover"
              />
            ) : (
              <div className="grid h-full place-items-center text-ink-300">
                <Building2 className="size-12" aria-hidden />
              </div>
            )}
          </div>

          <div className="p-5 lg:p-6">
            <div className="flex flex-wrap items-center gap-1.5">
              <ProjectStatusBadge status={project.status} />
              <EntityVerificationBadge status={project.verification_status} />
              {project.is_featured ? <Badge tone="accent">Featured</Badge> : null}
            </div>

            <h1 className="mt-3 text-2xl font-bold tracking-tight text-ink-950 sm:text-3xl">
              {project.name}
            </h1>

            <p className="mt-1.5 text-[0.9375rem] text-ink-700">
              {projectConfigurationLabel(project)}
            </p>

            {where ? (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-600">
                <MapPin className="size-4 shrink-0 text-ink-400" aria-hidden />
                {where}
                {project.pincode ? ` — ${project.pincode}` : ''}
              </p>
            ) : null}

            <p className="mt-4 text-2xl font-bold text-ink-950">{projectPriceLabel(project)}</p>

            {builder ? (
              <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-ink-100 pt-5">
                <div className="relative size-11 shrink-0 overflow-hidden rounded-lg bg-ink-100">
                  {builder.logo_url ? (
                    <Image src={builder.logo_url} alt="" fill sizes="44px" className="object-contain" />
                  ) : (
                    <div className="grid h-full place-items-center text-ink-300">
                      <Building2 className="size-5" aria-hidden />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-ink-500">Developed by</p>
                  <Link
                    href={`/builders/${builder.slug}`}
                    className="flex items-center gap-1.5 truncate text-sm font-semibold text-ink-900 hover:text-brand-700"
                  >
                    {builder.name}
                    {builder.is_verified ? (
                      <BadgeCheck className="size-4 shrink-0 text-brand-600" aria-hidden />
                    ) : null}
                  </Link>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 space-y-6">
            {/* ---- Key facts --------------------------------------------- */}
            <Section title="At a glance">
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Fact label="Type" value={PROJECT_TYPE_LABELS[project.project_type]} />
                <Fact label="Stage" value={PROJECT_STATUS_LABELS[project.status]} />
                {project.total_area ? (
                  <Fact
                    label="Total area"
                    value={`${project.total_area} ${AREA_UNIT_LABELS[project.total_area_unit]}`}
                    icon={Maximize2}
                  />
                ) : null}
                {project.total_units ? (
                  <Fact label="Units" value={String(project.total_units)} icon={LayoutGrid} />
                ) : null}
                {project.launch_date ? (
                  <Fact
                    label="Launched"
                    value={formatDate(project.launch_date)}
                    icon={CalendarDays}
                  />
                ) : null}
                {project.expected_completion_date ? (
                  <Fact
                    label="Expected completion"
                    value={formatDate(project.expected_completion_date)}
                    icon={CalendarDays}
                  />
                ) : null}
                {project.rera_number ? <Fact label="RERA" value={project.rera_number} /> : null}
                <Fact label="Views" value={formatCount(project.views_count)} icon={Eye} />
              </dl>
            </Section>

            {/* ---- Construction progress (§8) ---------------------------- */}
            {project.construction_progress_percentage != null ? (
              <Section title="Construction progress">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-lg font-bold text-ink-950">
                    {project.construction_progress_percentage}% complete
                  </p>
                  {/*
                    Always labelled with who is making the claim. A builder
                    reporting 60% and 99Estate confirming 60% are different
                    claims, and only an admin RPC can produce the second — so
                    this page must never print a bare "Verified" here.
                  */}
                  <ProgressSourceBadge status={project.progress_verification} />
                </div>

                <div
                  className="mt-3 h-2.5 overflow-hidden rounded-full bg-ink-100"
                  role="progressbar"
                  aria-valuenow={project.construction_progress_percentage}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Construction progress"
                >
                  <div
                    className="h-full rounded-full bg-brand-600"
                    style={{ width: `${project.construction_progress_percentage}%` }}
                  />
                </div>

                {project.construction_progress_note ? (
                  <p className="mt-3 text-sm text-ink-700">{project.construction_progress_note}</p>
                ) : null}
                {project.last_progress_update ? (
                  <p className="mt-1.5 text-xs text-ink-500">
                    Last updated {formatDate(project.last_progress_update)}
                  </p>
                ) : null}
              </Section>
            ) : null}

            {project.description ? (
              <Section title="About this project">
                <p className="whitespace-pre-line text-[0.9375rem] leading-relaxed text-ink-700">
                  {project.description}
                </p>
              </Section>
            ) : null}

            {/* ---- Inventory (§27) --------------------------------------- */}
            {units.length > 0 ? (
              <Section
                title="Units and availability"
                description={
                  project.units_available > 0
                    ? `${project.units_available} of ${project.units_total} available`
                    : 'Every loaded unit is taken'
                }
              >
                <UnitTable
                  units={units}
                  projectPath={projectPath}
                  selectedUnitId={selectedUnit?.id ?? null}
                />
              </Section>
            ) : null}

            {amenities.length > 0 ? (
              <Section title="Amenities">
                <ul className="flex flex-wrap gap-2">
                  {amenities.map((amenity) => (
                    <li key={amenity}>
                      <Badge>
                        <Sparkles className="size-3.5" aria-hidden />
                        {amenity}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}

            {gallery.length > 0 ? (
              <Section title="Gallery">
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {gallery.map((item) => (
                    <li key={item.id} className="relative aspect-[4/3] overflow-hidden rounded-lg bg-ink-100">
                      <Image
                        src={item.url}
                        alt={item.title ?? ''}
                        fill
                        sizes="(min-width: 640px) 240px, 45vw"
                        className="object-cover"
                      />
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}

            {floorPlans.length > 0 ? (
              <Section title="Plans">
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {floorPlans.map((item) => (
                    <li key={item.id}>
                      <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-ink-200 bg-white">
                        <Image
                          src={item.url}
                          alt={item.title ?? 'Plan'}
                          fill
                          sizes="(min-width: 640px) 360px, 90vw"
                          className="object-contain"
                        />
                      </div>
                      {item.title ? (
                        <p className="mt-1.5 text-xs text-ink-600">{item.title}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}

            {embed ? (
              <Section title="Location">
                <div className="overflow-hidden rounded-lg border border-ink-200">
                  <iframe
                    src={embed}
                    title={`Map of ${project.name}`}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    className="aspect-[16/10] w-full"
                  />
                </div>
                {project.address ? (
                  <p className="mt-3 text-sm text-ink-700">{project.address}</p>
                ) : null}
                {point ? (
                  <a
                    href={mapsLinkFor(point)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-sm font-semibold text-brand-700 hover:underline"
                  >
                    Open in Google Maps
                  </a>
                ) : null}
              </Section>
            ) : null}
          </div>

          {/* ---- Enquiry rail --------------------------------------------- */}
          <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
            <div id="enquire" className="scroll-mt-24 rounded-card border border-ink-200 bg-white p-5">
              {isOwnProject ? (
                <>
                  <p className="text-base font-semibold text-ink-900">Your project</p>
                  <p className="mt-1 text-sm text-ink-600">
                    Buyers see an enquiry form here. Yours go to{' '}
                    <Link href="/dashboard/leads" className="font-semibold text-brand-700 hover:underline">
                      your enquiries
                    </Link>
                    .
                  </p>
                </>
              ) : (
                <>
                  <p className="text-base font-semibold text-ink-900">
                    {selectedUnit ? 'Enquire about this unit' : 'Contact the builder'}
                  </p>
                  <p className="mt-1 text-sm text-ink-600">
                    {builder ? `Your details go straight to ${builder.name}.` : 'Send your details.'}
                  </p>

                  <div className="mt-4">
                    <ProjectEnquiryForm
                      projectId={project.id}
                      projectName={builder?.name ?? project.name}
                      unit={
                        selectedUnit
                          ? {
                              id: selectedUnit.id,
                              label: `${selectedUnit.unit_number}${
                                selectedUnit.unit_type ? ` · ${selectedUnit.unit_type}` : ''
                              }`,
                            }
                          : null
                      }
                      isSignedIn={isSignedIn}
                      defaultName={profile?.full_name ?? null}
                      returnTo={selectedUnit ? `${projectPath}?unit=${selectedUnit.id}` : projectPath}
                      projectPath={projectPath}
                    />
                  </div>
                </>
              )}
            </div>

            {brochure ? (
              <ButtonLink
                href={brochure.url}
                target="_blank"
                rel="noopener noreferrer"
                variant="outline"
                fullWidth
                className="mt-4"
              >
                Download brochure
              </ButtonLink>
            ) : null}

            {builder ? (
              <div className="mt-4 rounded-card border border-ink-200 bg-white p-5">
                <p className="text-sm font-semibold text-ink-900">About {builder.name}</p>
                {builder.established_year ? (
                  <p className="mt-1 text-xs text-ink-500">Since {builder.established_year}</p>
                ) : null}
                {builder.about ? (
                  <p className="mt-2 line-clamp-4 text-sm text-ink-600">{builder.about}</p>
                ) : null}
                <Link
                  href={`/builders/${builder.slug}`}
                  className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:underline"
                >
                  {builder.projects_count === 1
                    ? 'View builder profile'
                    : `View all ${builder.projects_count} projects`}
                </Link>
              </div>
            ) : null}

            <p className="mt-4 px-1 text-xs text-ink-500">
              {SITE_NAME} does not verify claims a builder makes about a project unless it carries a
              verified badge.
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-ink-200 bg-white p-5 lg:p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-ink-500">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Fact({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1 text-xs text-ink-500">
        {Icon ? <Icon className="size-3.5" aria-hidden /> : null}
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-semibold text-ink-900">{value}</dd>
    </div>
  );
}
