'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { deleteProject, setProjectPublished } from '@/lib/projects/actions';
import type { ProjectRow } from '@/lib/projects/queries';

/**
 * Publish / unpublish, and delete.
 *
 * Kept out of the main form on purpose. Saving the project record and deciding
 * whether the world can see it are two separate intentions, and a single Save
 * button that also published would mean a half-finished project went live the
 * first time somebody corrected a typo.
 */
export function ProjectVisibility({ project }: { project: ProjectRow }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = React.useState<null | 'publish' | 'delete'>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const suspended = project.verification_status === 'suspended';

  async function togglePublished() {
    setPending('publish');
    try {
      const formData = new FormData();
      formData.set('project_id', project.id);
      formData.set('published', String(!project.is_published));

      const result = await setProjectPublished(formData);

      if (!result.ok) {
        toast({ tone: 'error', title: result.error ?? 'That did not work' });
        return;
      }

      toast({
        tone: 'success',
        title: result.published ? 'Project is live' : 'Project taken off the site',
        description: result.published
          ? 'Buyers can find it and send enquiries.'
          : 'It stays in your dashboard and nothing is lost.',
      });
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  async function remove() {
    setPending('delete');
    try {
      const formData = new FormData();
      formData.set('project_id', project.id);

      // On success the action redirects, so nothing after this runs. A returned
      // object therefore always means it refused.
      const result = await deleteProject(formData);
      if (result && !result.ok) {
        toast({ tone: 'error', title: result.error ?? 'That did not work' });
        setConfirmDelete(false);
      }
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant={project.is_published ? 'outline' : 'primary'}
          onClick={togglePublished}
          loading={pending === 'publish'}
          disabled={suspended && !project.is_published}
        >
          {project.is_published ? (
            <>
              <EyeOff className="size-4" aria-hidden />
              Take off the site
            </>
          ) : (
            <>
              <Eye className="size-4" aria-hidden />
              Publish project
            </>
          )}
        </Button>

        {/* `canManage`, not `canManageInventory`: deleting a project is an
            owner-or-admin decision, which is what `deleteProject` checks and
            what `projects_delete_managers` enforces. Gated on the inventory
            right, this offered a sales manager a button that always refused. */}
        {project.canManage ? (
          <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-4" aria-hidden />
            Delete
          </Button>
        ) : null}
      </div>

      {suspended && !project.is_published ? (
        <p className="mt-2 text-xs text-red-700">
          This project is suspended, so it cannot be published. Contact 99Estate to resolve it.
        </p>
      ) : null}

      {/* Gated too, not just the button that opens it. The dialog renders its
          markup whether or not it is open, so leaving it mounted put a "Delete
          project" button in the accessibility tree for somebody who has no
          delete right — invisible and unclickable, but still announced. */}
      {project.canManage ? (
        <ConfirmDialog
          open={confirmDelete}
          onClose={() => setConfirmDelete(false)}
          onConfirm={remove}
          loading={pending === 'delete'}
          destructive
          title={`Delete ${project.name}?`}
          confirmLabel="Delete project"
          /* Spelled out because the cascade is wide and irreversible. The one
             thing it does *not* take is a listing attached to the project:
             properties.project_id is ON DELETE SET NULL, so those survive and
             simply stop being part of a project. */
          description={
            <>
              This also deletes its photos, amenities, buildings, floors, every unit in its
              inventory, and the {project.leads_count} enquir
              {project.leads_count === 1 ? 'y' : 'ies'} it has received. This cannot be undone.
              <br />
              <br />
              Any individual listing you attached to this project is kept — it just stops being
              part of a project.
            </>
          }
        />
      ) : null}
    </>
  );
}
