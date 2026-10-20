import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BadgeCheck, Building2, ChevronRight, Globe, MapPin } from 'lucide-react';
import { ProjectCard } from '@/components/project/project-card';
import { Badge, EntityVerificationBadge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { getBuilderDetail } from '@/lib/projects/public';
import { ORGANIZATION_TYPE_LABELS, SITE_NAME } from '@/lib/constants';
import { formatCount } from '@/lib/format';
import { getSiteUrl } from '@/lib/env';
import { JsonLd, breadcrumbJsonLd } from '@/lib/seo/json-ld';
import { clampToWord } from '@/lib/seo/meta';

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await getBuilderDetail(slug);

  if (!data) return { title: 'Builder not found', robots: { index: false, follow: false } };

  const { builder, projects } = data;
  const live = projects.filter((p) => p.is_published);

  const types = (builder.org_types ?? []).map((t) => ORGANIZATION_TYPE_LABELS[t]).join(', ');
  const where = [builder.locality, builder.city, builder.state].filter(Boolean).join(', ');

  const title = `${builder.name} — ${types || 'Builder'}${where ? ` in ${where}` : ''}`;

  /**
   * Built from columns, not from `about`, which is free text a builder uses as
   * a marketing paragraph. And deliberately never says "verified": that is an
   * admin decision, and a meta description is where a reader would believe it
   * without being able to check.
   */
  const description = clampToWord(
    `${builder.name}${where ? `, ${where}` : ''}. ${
      live.length > 0
        ? `${live.length} project${live.length === 1 ? '' : 's'} listed`
        : 'Projects and contact details'
    }${builder.established_year ? `. Established ${builder.established_year}` : ''}. ` +
      `See availability and prices free on ${SITE_NAME}.`,
    155,
  );

  const canonical = `/builders/${builder.slug}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'profile',
      title,
      description,
      url: `${getSiteUrl()}${canonical}`,
      images: builder.cover_image_url
        ? [{ url: builder.cover_image_url, width: 1200, height: 630, alt: builder.name ?? '' }]
        : undefined,
    },
    // A builder with nothing live is a thin page; let it be followed, not indexed.
    robots: live.length > 0 ? undefined : { index: false, follow: true },
  };
}

/**
 * §4 — the public builder profile.
 *
 * Reads `builder_public_profiles`, which is the curated column list: no phone,
 * no email, no GST, no admin notes. A buyer who wants to reach this company
 * does it through a project enquiry, so there is deliberately no contact
 * number on this page to scrape.
 */
export default async function BuilderProfilePage({ params }: PageProps) {
  const { slug } = await params;
  const data = await getBuilderDetail(slug);
  if (!data) notFound();

  const { builder, projects } = data;

  /**
   * The profile itself is only visible for an unsuspended company — the view
   * filters those out — but a company's own unpublished drafts can come back
   * from the projects query for a member. They must not be rendered on the
   * public profile, so the split happens here rather than in the query.
   */
  const live = projects.filter((p) => p.is_published);
  const where = [builder.locality, builder.city, builder.state].filter(Boolean).join(', ');

  return (
    <div className="bg-ink-50">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'Home', path: '/' },
          { name: 'Builders', path: '/projects' },
          { name: builder.name ?? 'Builder', path: `/builders/${builder.slug}` },
        ])}
      />

      <div className="container-page py-6 lg:py-8">
        <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1 text-xs text-ink-500">
          <Link href="/" className="hover:text-ink-800">Home</Link>
          <ChevronRight className="size-3" aria-hidden />
          <Link href="/projects" className="hover:text-ink-800">Projects</Link>
          <ChevronRight className="size-3" aria-hidden />
          <span className="truncate text-ink-700">{builder.name}</span>
        </nav>

        <div className="overflow-hidden rounded-card border border-ink-200 bg-white">
          {builder.cover_image_url ? (
            <div className="relative aspect-[21/7] bg-ink-100">
              <Image
                src={builder.cover_image_url}
                alt=""
                fill
                priority
                sizes="(min-width: 1024px) 1024px, 100vw"
                className="object-cover"
              />
            </div>
          ) : null}

          <div className="p-5 lg:p-6">
            <div className="flex flex-wrap items-start gap-4">
              <div className="relative size-16 shrink-0 overflow-hidden rounded-xl border border-ink-200 bg-white">
                {builder.logo_url ? (
                  <Image src={builder.logo_url} alt="" fill sizes="64px" className="object-contain p-1" />
                ) : (
                  <div className="grid h-full place-items-center text-ink-300">
                    <Building2 className="size-7" aria-hidden />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-ink-950 sm:text-3xl">
                  <span className="min-w-0 truncate">{builder.name}</span>
                  {builder.is_verified ? (
                    <BadgeCheck className="size-6 shrink-0 text-brand-600" aria-hidden />
                  ) : null}
                </h1>

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {builder.verification_status ? (
                    <EntityVerificationBadge status={builder.verification_status} />
                  ) : null}
                  {(builder.org_types ?? []).map((type) => (
                    <Badge key={type}>{ORGANIZATION_TYPE_LABELS[type]}</Badge>
                  ))}
                </div>

                {where ? (
                  <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-600">
                    <MapPin className="size-4 shrink-0 text-ink-400" aria-hidden />
                    {where}
                  </p>
                ) : null}
              </div>
            </div>

            <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-ink-100 pt-5 sm:grid-cols-4">
              <Stat label="Projects listed" value={formatCount(live.length)} />
              {builder.established_year ? (
                <Stat label="Established" value={String(builder.established_year)} />
              ) : null}
              {builder.rera_number ? <Stat label="RERA" value={builder.rera_number} /> : null}
              {builder.website ? (
                <div>
                  <dt className="text-xs text-ink-500">Website</dt>
                  <dd className="mt-0.5 truncate text-sm font-semibold">
                    <a
                      href={builder.website}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="inline-flex items-center gap-1 text-brand-700 hover:underline"
                    >
                      <Globe className="size-3.5 shrink-0" aria-hidden />
                      Visit
                    </a>
                  </dd>
                </div>
              ) : null}
            </dl>

            {builder.about ? (
              <div className="mt-6 border-t border-ink-100 pt-5">
                <h2 className="text-sm font-semibold text-ink-900">About</h2>
                <p className="mt-2 whitespace-pre-line text-[0.9375rem] leading-relaxed text-ink-700">
                  {builder.about}
                </p>
              </div>
            ) : null}
          </div>
        </div>

        <section className="mt-8">
          <h2 className="text-xl font-bold tracking-tight text-ink-950">
            {live.length === 0
              ? 'Projects'
              : `${live.length} project${live.length === 1 ? '' : 's'}`}
          </h2>

          {live.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                icon={<Building2 className="size-6" />}
                title="No projects listed yet"
                description={`${builder.name} has not published a project on ${SITE_NAME} yet. Browse everything else that is available.`}
                action={
                  <Link
                    href="/projects"
                    className="text-sm font-semibold text-brand-700 hover:underline"
                  >
                    Browse all projects
                  </Link>
                }
              />
            </div>
          ) : (
            <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {live.map((project) => (
                <li key={project.id}>
                  <ProjectCard project={project} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Said once, here. A profile page is exactly where somebody decides
            whether to trust a company, so the limit of what we checked belongs
            on it rather than only in the Terms. */}
        <p className="mt-8 text-xs text-ink-500">
          {builder.is_verified
            ? `${SITE_NAME} has checked this company's registration details. We do not endorse its projects or guarantee delivery.`
            : `${SITE_NAME} has not verified this company. Check registration and RERA details yourself before paying anything.`}
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-semibold text-ink-900">{value}</dd>
    </div>
  );
}
