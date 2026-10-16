'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, Label, PriceInput, Select, Textarea } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import {
  AREA_UNIT_LABELS,
  BEDROOM_OPTION_CHOICES,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_ORDER,
  PROJECT_TYPE_LABELS,
} from '@/lib/constants';
import type { ProjectFormState } from '@/lib/projects/actions';
import type { ProjectRow } from '@/lib/projects/queries';
import type { Enums } from '@/types/database.types';

const INITIAL: ProjectFormState = { ok: false };

const PROJECT_TYPE_ORDER: Enums<'project_type'>[] = [
  'apartment',
  'villa',
  'independent_house',
  'plot',
  'commercial',
  'mixed_development',
];

/**
 * Area units a whole development is actually measured in. The full list runs to
 * ten, most of which describe a single plot — offering `sqft` for a 12-acre
 * layout is a units mistake waiting to happen.
 */
const SITE_AREA_UNITS: Enums<'area_unit'>[] = ['acre', 'hectare', 'sqft', 'sqyd', 'cent', 'guntha'];

/** §15 — a plot layout has no bedrooms, so the BHK picker has no business there. */
const TYPES_WITHOUT_BEDROOMS: Enums<'project_type'>[] = ['plot', 'commercial'];

type Action = (state: ProjectFormState, formData: FormData) => Promise<ProjectFormState>;

type CompanyChoice = { id: string; name: string };

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending}>
      {label}
    </Button>
  );
}

export function ProjectForm({
  action,
  companies,
  project,
  submitLabel = 'Save changes',
}: {
  action: Action;
  /** Every company the user may create a project for. One is the common case. */
  companies: CompanyChoice[];
  project?: ProjectRow | null;
  submitLabel?: string;
}) {
  const [state, formAction] = useActionState(action, INITIAL);
  const toast = useToast();

  /**
   * Which fields are relevant follows the project type, so it has to be state
   * rather than a `defaultValue` — picking "Plot / layout" should take the BHK
   * question away immediately, not after a save.
   */
  const [projectType, setProjectType] = useState<Enums<'project_type'>>(
    project?.project_type ?? 'apartment',
  );

  useEffect(() => {
    if (state.ok) toast({ tone: 'success', title: 'Project saved' });
  }, [state, toast]);

  const showBedrooms = !TYPES_WITHOUT_BEDROOMS.includes(projectType);
  const selectedBedrooms = new Set(project?.bedroom_options ?? []);

  return (
    <form action={formAction} className="space-y-6">
      {project ? <input type="hidden" name="project_id" value={project.id} /> : null}

      {state.error ? (
        <div
          role="alert"
          className="rounded-field border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
        >
          {state.error}
        </div>
      ) : null}

      <fieldset className="space-y-5">
        <legend className="text-sm font-semibold text-ink-900">The project</legend>

        {/* With one company this is a hidden field: asking somebody to choose
            from a list of one is a question with no information in it. */}
        {companies.length > 1 ? (
          <Field
            label="Company"
            htmlFor="organization_id"
            required
            error={state.fieldErrors?.organization_id}
            hint={project ? 'A project cannot be moved to another company.' : undefined}
          >
            <Select
              id="organization_id"
              name="organization_id"
              defaultValue={project?.organization_id ?? companies[0]?.id}
              disabled={Boolean(project)}
              required
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <input
            type="hidden"
            name="organization_id"
            value={project?.organization_id ?? companies[0]?.id ?? ''}
          />
        )}

        <Field label="Project name" htmlFor="name" required error={state.fieldErrors?.name}>
          <Input
            id="name"
            name="name"
            defaultValue={project?.name ?? ''}
            placeholder="Green Valley Phase 2"
            maxLength={150}
            required
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="What is being built"
            htmlFor="project_type"
            required
            error={state.fieldErrors?.project_type}
          >
            <Select
              id="project_type"
              name="project_type"
              value={projectType}
              onChange={(e) => setProjectType(e.target.value as Enums<'project_type'>)}
              required
            >
              {PROJECT_TYPE_ORDER.map((type) => (
                <option key={type} value={type}>
                  {PROJECT_TYPE_LABELS[type]}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Construction stage"
            htmlFor="status"
            required
            error={state.fieldErrors?.status}
            hint="Where the building has got to. Separate from whether the page is live."
          >
            <Select
              id="status"
              name="status"
              defaultValue={project?.status ?? 'upcoming'}
              required
            >
              {PROJECT_STATUS_ORDER.map((status) => (
                <option key={status} value={status}>
                  {PROJECT_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field
          label="Description"
          htmlFor="description"
          error={state.fieldErrors?.description}
          hint="What makes this project worth a site visit."
        >
          <Textarea
            id="description"
            name="description"
            defaultValue={project?.description ?? ''}
            rows={5}
            maxLength={12000}
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Your project code"
            htmlFor="project_code"
            error={state.fieldErrors?.project_code}
            hint="Your own internal reference, e.g. ABCH-P2. Must be unique within your company."
          >
            <Input
              id="project_code"
              name="project_code"
              defaultValue={project?.project_code ?? ''}
              maxLength={40}
            />
          </Field>

          <Field
            label="RERA number"
            htmlFor="rera_number"
            error={state.fieldErrors?.rera_number}
          >
            <Input
              id="rera_number"
              name="rera_number"
              defaultValue={project?.rera_number ?? ''}
              maxLength={60}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-5 border-t border-ink-100 pt-6">
        <legend className="text-sm font-semibold text-ink-900">Where it is</legend>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="City" htmlFor="city" required error={state.fieldErrors?.city}>
            <Input
              id="city"
              name="city"
              defaultValue={project?.city ?? ''}
              maxLength={80}
              required
            />
          </Field>

          <Field
            label="Locality"
            htmlFor="locality"
            error={state.fieldErrors?.locality}
            hint="Helps buyers find the project, and forms part of its web address."
          >
            <Input
              id="locality"
              name="locality"
              defaultValue={project?.locality ?? ''}
              maxLength={120}
            />
          </Field>

          <Field label="District" htmlFor="district" error={state.fieldErrors?.district}>
            <Input
              id="district"
              name="district"
              defaultValue={project?.district ?? ''}
              maxLength={80}
            />
          </Field>

          <Field label="State" htmlFor="state" error={state.fieldErrors?.state}>
            <Input id="state" name="state" defaultValue={project?.state ?? ''} maxLength={80} />
          </Field>
        </div>

        <Field label="Site address" htmlFor="address" error={state.fieldErrors?.address}>
          <Textarea
            id="address"
            name="address"
            defaultValue={project?.address ?? ''}
            rows={2}
            maxLength={500}
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="PIN code" htmlFor="pincode" error={state.fieldErrors?.pincode}>
            <Input
              id="pincode"
              name="pincode"
              inputMode="numeric"
              defaultValue={project?.pincode ?? ''}
              maxLength={6}
            />
          </Field>

          <Field
            label="Google Maps link"
            htmlFor="map_url"
            error={state.fieldErrors?.map_url}
            hint="Open the site in Maps, press Share, then Copy link."
          >
            <Input
              id="map_url"
              name="map_url"
              type="url"
              defaultValue={project?.map_url ?? ''}
              maxLength={2048}
            />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-5 border-t border-ink-100 pt-6">
        <legend className="text-sm font-semibold text-ink-900">Scale and pricing</legend>

        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="Total site area" htmlFor="total_area" error={state.fieldErrors?.total_area}>
            <Input
              id="total_area"
              name="total_area"
              inputMode="decimal"
              defaultValue={project?.total_area ?? ''}
            />
          </Field>

          <Field label="Unit" htmlFor="total_area_unit" error={state.fieldErrors?.total_area_unit}>
            <Select
              id="total_area_unit"
              name="total_area_unit"
              defaultValue={project?.total_area_unit ?? 'acre'}
            >
              {SITE_AREA_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {AREA_UNIT_LABELS[unit]}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Units in the project"
            htmlFor="total_units"
            error={state.fieldErrors?.total_units}
            hint="From your brochure."
          >
            <Input
              id="total_units"
              name="total_units"
              inputMode="numeric"
              defaultValue={project?.total_units ?? ''}
            />
          </Field>
        </div>

        {/* The declared range, which is what the project card shows. Kept
            separate from whatever the loaded inventory happens to cost: silently
            contradicting a builder's own brochure would be worse than showing
            nothing. */}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Starting price"
            htmlFor="price_min"
            error={state.fieldErrors?.price_min}
            hint="Shown as a range on your project card."
          >
            <PriceInput id="price_min" name="price_min" defaultValue={project?.price_min ?? ''} />
          </Field>

          <Field label="Top price" htmlFor="price_max" error={state.fieldErrors?.price_max}>
            <PriceInput id="price_max" name="price_max" defaultValue={project?.price_max ?? ''} />
          </Field>
        </div>

        {showBedrooms ? (
          <div className="flex flex-col gap-1.5">
            <Label>Configurations available</Label>
            <div className="flex flex-wrap gap-2">
              {BEDROOM_OPTION_CHOICES.map((bhk) => (
                <label
                  key={bhk}
                  className="flex cursor-pointer items-center gap-2 rounded-field border border-ink-200 px-3 py-2 text-sm text-ink-800 transition-colors hover:border-ink-300 hover:bg-ink-50 has-[:checked]:border-brand-300 has-[:checked]:bg-brand-50"
                >
                  <Checkbox
                    name="bedroom_options"
                    value={bhk}
                    defaultChecked={selectedBedrooms.has(bhk)}
                  />
                  {bhk} BHK
                </label>
              ))}
            </div>
            <p className="text-xs text-ink-500">
              Becomes &ldquo;2 &amp; 3 BHK&rdquo; on your project card.
            </p>
          </div>
        ) : null}
      </fieldset>

      <fieldset className="space-y-5 border-t border-ink-100 pt-6">
        <legend className="text-sm font-semibold text-ink-900">Timeline and progress</legend>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Launch date" htmlFor="launch_date" error={state.fieldErrors?.launch_date}>
            <Input
              id="launch_date"
              name="launch_date"
              type="date"
              defaultValue={project?.launch_date ?? ''}
            />
          </Field>

          <Field
            label="Expected completion"
            htmlFor="expected_completion_date"
            error={state.fieldErrors?.expected_completion_date}
          >
            <Input
              id="expected_completion_date"
              name="expected_completion_date"
              type="date"
              defaultValue={project?.expected_completion_date ?? ''}
            />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <Field
            label="Construction progress"
            htmlFor="construction_progress_percentage"
            error={state.fieldErrors?.construction_progress_percentage}
          >
            <div className="relative">
              <Input
                id="construction_progress_percentage"
                name="construction_progress_percentage"
                inputMode="numeric"
                className="pr-8"
                defaultValue={project?.construction_progress_percentage ?? ''}
              />
              <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[0.9375rem] text-ink-500">
                %
              </span>
            </div>
          </Field>

          <Field
            label="What has been done"
            htmlFor="construction_progress_note"
            error={state.fieldErrors?.construction_progress_note}
            /* §8 — the honest framing, said where it is entered rather than
               only where it is displayed. */
            hint="Shown as reported by you. 99Estate marks progress as verified only after checking it."
          >
            <Input
              id="construction_progress_note"
              name="construction_progress_note"
              defaultValue={project?.construction_progress_note ?? ''}
              maxLength={1000}
              placeholder="Tower A slab at 7th floor"
            />
          </Field>
        </div>
      </fieldset>

      <div className="border-t border-ink-100 pt-6">
        <SubmitButton label={submitLabel} />
      </div>
    </form>
  );
}
