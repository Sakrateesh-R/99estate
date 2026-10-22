import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import {
  Badge,
  EntityVerificationBadge,
  ProgressSourceBadge,
  ProjectStatusBadge,
} from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProjectForm } from '@/components/dashboard/project-form';
import { ProjectAmenities } from '@/components/dashboard/project-amenities';
import { ProjectMedia } from '@/components/dashboard/project-media';
import { ProjectPlans } from '@/components/dashboard/project-plans';
import { ProjectVisibility } from '@/components/dashboard/project-visibility';
import { requireProfile } from '@/lib/auth/session';
import { listProjectAmenities, updateProject } from '@/lib/projects/actions';
import { listProjectMedia } from '@/lib/projects/media-actions';
import { getAmenityOptions } from '@/lib/properties/seller-queries';
import { getMyProject } from '@/lib/projects/queries';
import { formatCount, formatDate } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Edit project',
  robots: { index: false, follow: false },
};

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireProfile();
  const { id } = await params;

  /**
   * `getMyProject` returns null both for a project that does not exist and for
   * one belonging to a company the caller does not act for, so a 404 is the
   * right answer to both — distinguishing them would confirm the project exists
   * to somebody with no business knowing that.
   */
  const project = await getMyProject(id);
  if (!project) notFound();

  const [media, amenities, amenityOptions] = await Promise.all([
    listProjectMedia(project.id),
    listProjectAmenities(project.id),
    getAmenityOptions(),
  ]);

  const plans = media.filter((m) => m.type === 'floor_plan' || m.type === 'master_plan');

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/dashboard/projects"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-900"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to projects
        </Link>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">
              {project.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge tone={project.is_published ? 'success' : 'neutral'}>
                {project.is_published ? 'Live' : 'Draft'}
              </Badge>
              <ProjectStatusBadge status={project.status} />
              <EntityVerificationBadge status={project.verification_status} />
            </div>
          </div>

          {project.is_published ? (
            <Link
              href={`/projects/${project.slug}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline"
            >
              View public page
              <ExternalLink className="size-3.5" aria-hidden />
            </Link>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Visibility</CardTitle>
        </CardHeader>
        <CardContent>
          <ProjectVisibility project={project} />

          <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-ink-100 pt-5 sm:grid-cols-4">
            <Stat label="Units loaded" value={formatCount(project.units_total)} />
            <Stat label="Available" value={formatCount(project.units_available)} />
            <Stat label="Enquiries" value={formatCount(project.leads_count)} />
            <Stat label="Views" value={formatCount(project.views_count)} />
          </dl>

          {/* §8 — the progress claim, always labelled with who is making it.
              Rendering a bare "Verified" here for a number the builder typed in
              themselves is exactly what the spec forbids. */}
          {project.construction_progress_percentage != null ? (
            <div className="mt-6 border-t border-ink-100 pt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink-900">
                  Construction progress: {project.construction_progress_percentage}%
                </p>
                <ProgressSourceBadge status={project.progress_verification} />
              </div>
              <div
                className="mt-2 h-2 overflow-hidden rounded-full bg-ink-100"
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
              {project.last_progress_update ? (
                <p className="mt-1.5 text-xs text-ink-500">
                  Last updated {formatDate(project.last_progress_update)}
                </p>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Project details</CardTitle>
        </CardHeader>
        <CardContent>
          {project.canManageMarketing ? (
            <ProjectForm
              action={updateProject}
              companies={[{ id: project.organization_id, name: project.organizationName }]}
              project={project}
            />
          ) : (
            <p className="text-sm text-ink-600">
              You have read-only access to this project. Ask an owner or admin of{' '}
              {project.organizationName} for the marketing role to edit it.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Photos &amp; video</CardTitle>
        </CardHeader>
        <CardContent>
          <ProjectMedia
            projectId={project.id}
            initialMedia={media.filter(
              (m) => m.type === 'cover' || m.type === 'gallery',
            )}
            initialVideoUrl={media.find((m) => m.type === 'video')?.url ?? ''}
            readOnly={!project.canManageMarketing}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Plans</CardTitle>
        </CardHeader>
        <CardContent>
          <ProjectPlans
            projectId={project.id}
            initialPlans={plans}
            totalMediaCount={media.length}
            readOnly={!project.canManageMarketing}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Amenities</CardTitle>
        </CardHeader>
        <CardContent>
          <ProjectAmenities
            projectId={project.id}
            projectType={project.project_type}
            options={amenityOptions}
            initialSelected={amenities}
            readOnly={!project.canManageMarketing}
          />
        </CardContent>
      </Card>

      {/* Stated rather than silently absent, so a builder is not left wondering
          where the remaining tools are. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Coming next</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-ink-600">
            The brochure, towers and the unit-by-unit inventory for this project are not built yet.
            Photos, plans, the video, amenities, the project page and the enquiry inbox all work
            today.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink-900">{value}</dd>
    </div>
  );
}
