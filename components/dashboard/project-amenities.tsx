'use client';

import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { AmenitiesStep } from '@/components/dashboard/property-wizard/steps';
import { setProjectAmenities } from '@/lib/projects/actions';

/**
 * §10 — what the project comes with.
 *
 * `AmenitiesStep` is the listing wizard's own control, reused rather than
 * reimplemented. It already groups by category, hides the groups that make no
 * sense for land without discarding anything already ticked, and reads from the
 * shared `amenities` vocabulary — so a clubhouse is spelled the same way on a
 * project as on a flat, which is what lets a buyer filtering for one find both.
 *
 * Saved by a button rather than per-toggle. Ticking twelve amenities would
 * otherwise be twelve round trips, and a half-applied list is a worse thing to
 * leave behind than an unsaved one.
 */
export function ProjectAmenities({
  projectId,
  projectType,
  options,
  initialSelected,
  readOnly = false,
}: {
  projectId: string;
  projectType: string;
  options: { name: string; category: string }[];
  initialSelected: string[];
  readOnly?: boolean;
}) {
  const toast = useToast();
  const [selected, setSelected] = React.useState<string[]>(initialSelected);
  const [saved, setSaved] = React.useState<string[]>(initialSelected);
  const [saving, setSaving] = React.useState(false);

  const dirty =
    selected.length !== saved.length || selected.some((name) => !saved.includes(name));

  function toggle(name: string) {
    setSelected((current) =>
      current.includes(name) ? current.filter((n) => n !== name) : [...current, name],
    );
  }

  async function save() {
    setSaving(true);
    try {
      const result = await setProjectAmenities(projectId, selected);
      if (!result.ok) {
        toast({ tone: 'error', title: 'Could not save the amenities', description: result.error });
        return;
      }
      setSaved(selected);
      toast({
        tone: 'success',
        title: selected.length === 0 ? 'Amenities cleared' : 'Amenities saved',
      });
    } finally {
      setSaving(false);
    }
  }

  if (readOnly) {
    return (
      <p className="text-sm text-ink-600">
        You have read-only access to this project, so its amenities cannot be changed.
      </p>
    );
  }

  return (
    <div>
      <p className="text-sm text-ink-600">
        Tick what the project actually has, built or promised. These show on the project page and
        are what buyers filter on.
      </p>

      <div className="mt-6">
        <AmenitiesStep
          options={options}
          selected={selected}
          onToggle={toggle}
          /**
           * The project types and the property types are different enums, and
           * `AmenitiesStep` speaks the property one. A plot layout has no lift
           * and no clubhouse for the same reason a residential plot does not,
           * so it is mapped onto the nearest property type rather than given a
           * second copy of the hiding rule.
           */
          propertyType={projectType === 'plot' ? 'residential_plot' : undefined}
        />
      </div>

      <div className="mt-6 flex items-center gap-3 border-t border-ink-100 pt-5">
        <Button type="button" onClick={() => void save()} disabled={saving || !dirty}>
          {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          Save amenities
        </Button>
        <p className="text-xs text-ink-500">
          {selected.length === 0
            ? 'Nothing selected yet.'
            : `${selected.length} selected${dirty ? ' · unsaved' : ''}`}
        </p>
      </div>
    </div>
  );
}
