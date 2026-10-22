import type { Metadata } from 'next';
import Link from 'next/link';

import { ArrowLeft } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { ProjectForm } from '@/components/dashboard/project-form';
import { createProject } from '@/lib/projects/actions';
import { getMyOrganizations } from '@/lib/organizations/queries';
import { requireCompleteProfile } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: 'Add a project',
  robots: { index: false, follow: false },
};

export default async function NewProjectPage() {
  await requireCompleteProfile();

  const memberships = await getMyOrganizations();

  /**
   * Only owners and admins may create a project (`projects_insert_managers`),
   * so the picker offers only the companies where that is true.
   *
   * An empty list is no longer a dead end. It used to redirect away, which made
   * "add a project" mean "go and register a company, then come back" — a form
   * in front of a form, for a record most builders in this phase do not think
   * about. The form now renders with no company field at all and
   * `createProject` resolves one through `ensureProjectWorkspace()`.
   */
  const eligible = memberships.filter((m) => m.canManage);

  const companies = eligible.map((m) => ({ id: m.organization.id, name: m.organization.name }));

  return (
    <div>
      <Link
        href="/dashboard/projects"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-900"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to projects
      </Link>

      <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">Add a project</h1>
      <p className="mt-1.5 max-w-prose text-[0.9375rem] text-ink-600">
        Start with the name, what is being built and where. The project is saved as a draft and you
        go straight to adding photos and a video — you decide when it goes live.
      </p>

      <Card className="mt-8">
        <CardContent>
          <ProjectForm action={createProject} companies={companies} submitLabel="Create project" />
        </CardContent>
      </Card>
    </div>
  );
}
