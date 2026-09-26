'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, Loader2, Save, SendHorizonal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import {
  AmenitiesStep,
  BasicInfoStep,
  DetailsStep,
  LocationStep,
  type WizardValues,
} from '@/components/dashboard/property-wizard/steps';
import { ImageUploader } from '@/components/dashboard/property-wizard/image-uploader';
import { VideoField } from '@/components/dashboard/property-wizard/video-field';
import { PreviewStep } from '@/components/dashboard/property-wizard/preview-step';
import {
  savePropertyDraft,
  setPropertyAmenities,
  submitPropertyForReview,
} from '@/lib/properties/actions';
import type { RegisteredImage } from '@/lib/properties/image-actions';
import {
  basicInfoSchema,
  detailsSchema,
  locationSchema,
  MIN_IMAGES_FOR_SUBMISSION,
  photoRequirementLabel,
} from '@/lib/properties/schema';
import { LISTING_TYPE_LABELS } from '@/lib/constants';

const STEPS = [
  { id: 1, label: 'Basics', hint: 'What and how much' },
  { id: 2, label: 'Details', hint: 'Size, rooms, condition' },
  { id: 3, label: 'Location', hint: 'Where it is' },
  { id: 4, label: 'Amenities', hint: 'What it comes with' },
  { id: 5, label: 'Photos', hint: 'Show it off' },
  { id: 6, label: 'Preview', hint: 'How buyers see it' },
  { id: 7, label: 'Submit', hint: 'Send for review' },
] as const;

/** The step at which the draft first hits the database — `city` is NOT NULL. */
const PERSIST_FROM_STEP = 3;

export const EMPTY_WIZARD_VALUES: WizardValues = {
  listing_type: 'sale',
  seller_type: 'owner',
  property_type: '',
  title: '',
  price: '',
  is_negotiable: false,
  area: '',
  area_unit: 'sqft',
  bedrooms: '',
  bathrooms: '',
  balconies: '',
  floor_number: '',
  total_floors: '',
  property_age: '',
  furnishing_status: '',
  parking: '',
  facing: '',
  description: '',
  country: 'India',
  state: '',
  city: '',
  locality: '',
  pincode: '',
  address: '',
  latitude: '',
  longitude: '',
  video_url: '',
};

/**
 * Every key present and non-null, whatever arrived.
 *
 * `undefined` and `null` are both dropped in favour of the default: a plain
 * spread would let an explicitly-undefined key overwrite a good default with
 * nothing, which is the failure this exists to prevent.
 */
function withDefaults(initial: Partial<WizardValues> | null | undefined): WizardValues {
  const merged: WizardValues = { ...EMPTY_WIZARD_VALUES };

  for (const key of Object.keys(EMPTY_WIZARD_VALUES) as (keyof WizardValues)[]) {
    const value = initial?.[key];
    if (value !== undefined && value !== null) {
      // Each key's type is its own; the cast is confined to this one assignment
      // rather than widening the whole object.
      (merged[key] as WizardValues[typeof key]) = value as WizardValues[typeof key];
    }
  }

  return merged;
}

export function PropertyWizard({
  propertyId: initialPropertyId,
  initialValues,
  initialAmenities,
  initialImages,
  amenityOptions,
  cities,
  publishesDirectly = false,
}: {
  propertyId: string | null;
  initialValues: WizardValues;
  initialAmenities: string[];
  initialImages: RegisteredImage[];
  amenityOptions: { name: string; category: string }[];
  cities: { city: string; state: string }[];
  /**
   * True for an admin, whose submission goes live immediately rather than into
   * the moderation queue. Only changes what the screen promises — the server
   * decides, from the session, which of the two actually happens.
   */
  publishesDirectly?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  const [step, setStep] = React.useState(1);
  /**
   * Filled from EMPTY_WIZARD_VALUES rather than trusted as-is.
   *
   * Every field here is typed `string`, and the steps read them as strings —
   * `values.description.length` for a character counter, and so on. But these
   * props cross a server/client boundary, so "this key is a string" is a compile
   * time claim about a runtime object. Production white-screened on exactly that:
   * a missing `description` turned a hint into
   * "Cannot read properties of undefined (reading 'length')", and the whole form
   * went down for a character count.
   *
   * Merging over the defaults makes a missing or null key impossible for every
   * step at once, instead of each field needing its own guard and one of them
   * eventually being forgotten.
   */
  const [values, setValues] = React.useState<WizardValues>(() => withDefaults(initialValues));
  const [amenities, setAmenities] = React.useState<string[]>(initialAmenities);
  const [propertyId, setPropertyId] = React.useState<string | null>(initialPropertyId);
  const [imageCount, setImageCount] = React.useState(initialImages.length);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);

  const set = React.useCallback(
    <K extends keyof WizardValues>(key: K, value: WizardValues[K]) => {
      setValues((current) => ({ ...current, [key]: value }));
      setErrors((current) => {
        if (!(key in current)) return current;
        const next = { ...current };
        delete next[key as string];
        return next;
      });
    },
    [],
  );

  /** Validates only the fields the current step is responsible for. */
  function validateStep(target: number): boolean {
    const schema =
      target === 1 ? basicInfoSchema : target === 2 ? detailsSchema : target === 3 ? locationSchema : null;

    if (!schema) return true;

    const parsed = schema.safeParse(values);
    if (parsed.success) {
      setErrors({});
      return true;
    }

    const next: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.');
      if (key && !next[key]) next[key] = issue.message;
    }
    setErrors(next);
    return false;
  }

  /** Writes the listing row. Returns its id, or null if the save failed. */
  async function persist(): Promise<string | null> {
    const result = await savePropertyDraft(propertyId, values);

    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      toast({ tone: 'error', title: 'Could not save', description: result.error });
      return null;
    }

    setPropertyId(result.data.propertyId);
    return result.data.propertyId;
  }

  async function goNext() {
    if (!validateStep(step)) {
      toast({ tone: 'warning', title: 'Some details need fixing' });
      return;
    }

    setBusy(true);
    try {
      if (step >= PERSIST_FROM_STEP) {
        const id = await persist();
        if (!id) return;
      }

      if (step === 4 && propertyId) {
        const result = await setPropertyAmenities(propertyId, amenities);
        if (!result.ok) {
          toast({ tone: 'error', title: 'Could not save amenities', description: result.error });
          return;
        }
      }

      setStep((s) => Math.min(STEPS.length, s + 1));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setBusy(false);
    }
  }

  function goBack() {
    setStep((s) => Math.max(1, s - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function saveAndExit() {
    setBusy(true);
    try {
      const id = await persist();
      if (!id) return;
      if (amenities.length) await setPropertyAmenities(id, amenities);
      toast({ tone: 'success', title: 'Draft saved', description: 'Pick up where you left off any time.' });
      router.push('/dashboard/properties');
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!propertyId) return;

    setBusy(true);
    try {
      const id = await persist();
      if (!id) return;

      const result = await submitPropertyForReview(id);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast({ tone: 'error', title: 'Not ready to submit', description: result.error });
        return;
      }

      // An admin's listing is published outright rather than queued, so the
      // confirmation has to describe what actually happened.
      toast(
        result.data.status === 'published'
          ? {
              tone: 'success',
              title: 'Published',
              description: 'It is live in search now, for the next 90 days.',
            }
          : {
              tone: 'success',
              title: 'Submitted for review',
              description: 'We will let you know as soon as it goes live.',
            },
      );
      router.push('/dashboard/properties');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const canSaveDraft = step >= PERSIST_FROM_STEP;
  const needsMorePhotos = imageCount < MIN_IMAGES_FOR_SUBMISSION;

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <StepRail step={step} onSelect={(target) => target < step && setStep(target)} />

      <div className="min-w-0">
        <div className="rounded-card border border-ink-200 bg-white p-5 sm:p-7">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">
            Step {step} of {STEPS.length}
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">
            {STEP_TITLES[step - 1]}
          </h2>
          <p className="mt-1.5 text-sm text-ink-600">{STEP_BLURBS[step - 1]}</p>

          <div className="mt-7">
            {step === 1 ? <BasicInfoStep values={values} errors={errors} set={set} /> : null}
            {step === 2 ? <DetailsStep values={values} errors={errors} set={set} /> : null}
            {step === 3 ? (
              <LocationStep values={values} errors={errors} set={set} cities={cities} />
            ) : null}

            {step === 4 ? (
              <AmenitiesStep
                options={amenityOptions}
                selected={amenities}
                onToggle={(name) =>
                  setAmenities((current) =>
                    current.includes(name) ? current.filter((a) => a !== name) : [...current, name],
                  )
                }
              />
            ) : null}

            {step === 5 ? (
              <>
                {propertyId ? (
                  <ImageUploader
                    propertyId={propertyId}
                    initialImages={initialImages}
                    onCountChange={setImageCount}
                  />
                ) : (
                  <p className="text-sm text-ink-500">Save the location step first to add photos.</p>
                )}
                {/*
                  Sits with the photos rather than in its own step: it is the
                  same job — showing the place — and a step containing one
                  optional field reads as more work than it is.
                */}
                <VideoField
                  value={values.video_url}
                  error={errors.video_url}
                  onChange={(v) => set('video_url', v)}
                />
              </>
            ) : null}

            {step === 6 ? (
              <PreviewStep values={values} amenities={amenities} images={initialImages} />
            ) : null}

            {step === 7 ? (
              <SubmitStep
                values={values}
                imageCount={imageCount}
                publishesDirectly={publishesDirectly}
              />
            ) : null}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {step > 1 ? (
            <Button variant="outline" onClick={goBack} disabled={busy}>
              <ArrowLeft className="size-4" aria-hidden />
              Back
            </Button>
          ) : null}

          {step < STEPS.length ? (
            <Button onClick={goNext} loading={busy}>
              Continue
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          ) : (
            <Button onClick={submit} loading={busy} disabled={needsMorePhotos} size="lg">
              <SendHorizonal className="size-4" aria-hidden />
              {publishesDirectly ? 'Publish now' : 'Submit for review'}
            </Button>
          )}

          {canSaveDraft ? (
            <Button variant="ghost" onClick={saveAndExit} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" aria-hidden />}
              Save draft and exit
            </Button>
          ) : null}
        </div>

        {step === STEPS.length && needsMorePhotos ? (
          <p className="mt-3 text-sm font-medium text-amber-700">
            Add at least {photoRequirementLabel()} in step 5 before submitting.
          </p>
        ) : null}
      </div>
    </div>
  );
}

const STEP_TITLES = [
  'Basic information',
  'Property details',
  'Location',
  'Amenities',
  'Photos',
  'Preview your listing',
  'Ready to submit',
];

const STEP_BLURBS = [
  'Tell us what you are listing and what you are asking for it.',
  'The specifics buyers filter on. The more you fill in, the better your listing ranks.',
  'Buyers search by city and locality, so be precise. Your full address stays private.',
  'Pick everything the property genuinely offers.',
  'Listings with photos get far more enquiries. Drag to reorder; the first is the cover.',
  'This is exactly what a buyer will see. Go back and adjust anything that looks off.',
  'One last look at what happens next.',
];

function StepRail({ step, onSelect }: { step: number; onSelect: (target: number) => void }) {
  return (
    <nav aria-label="Posting steps" className="min-w-0 lg:sticky lg:top-24 lg:self-start">
      {/* Mobile: a compact progress bar. A 7-item vertical rail would eat the
          entire first screen on a phone. */}
      <div className="lg:hidden">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-ink-900">{STEPS[step - 1]?.label}</span>
          <span className="text-ink-500">
            {step} / {STEPS.length}
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-200">
          <div
            className="h-full rounded-full bg-brand-600 transition-[width] duration-300"
            style={{ width: `${(step / STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      <ol className="hidden lg:block">
        {STEPS.map((item) => {
          const done = item.id < step;
          const current = item.id === step;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                disabled={!done}
                className={cn(
                  'flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                  current && 'bg-brand-50',
                  done && 'hover:bg-ink-100',
                  !done && !current && 'cursor-default opacity-60',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold',
                    done
                      ? 'bg-brand-600 text-white'
                      : current
                        ? 'bg-brand-700 text-white'
                        : 'bg-ink-200 text-ink-600',
                  )}
                >
                  {done ? <Check className="size-3.5" aria-hidden /> : item.id}
                </span>
                <span className="min-w-0">
                  <span
                    className={cn(
                      'block text-sm font-semibold',
                      current ? 'text-brand-900' : 'text-ink-800',
                    )}
                  >
                    {item.label}
                  </span>
                  <span className="block text-xs text-ink-500">{item.hint}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function SubmitStep({
  values,
  imageCount,
  publishesDirectly,
}: {
  values: WizardValues;
  imageCount: number;
  publishesDirectly: boolean;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-field border border-brand-200 bg-brand-50/60 p-5">
        <h3 className="text-sm font-semibold text-brand-900">What happens next</h3>
        <ol className="mt-3 space-y-2.5 text-sm text-ink-700">
          {/* An admin is the reviewer, so promising them a review would be
              describing a queue they are standing on the other side of. */}
          {publishesDirectly ? (
            <li className="flex gap-2.5">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-600" aria-hidden />
              This publishes immediately — no review queue, because you are the reviewer.
            </li>
          ) : (
            <li className="flex gap-2.5">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-600" aria-hidden />
              Our team reviews the listing — usually within a few hours.
            </li>
          )}
          <li className="flex gap-2.5">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-600" aria-hidden />
            {publishesDirectly
              ? 'It goes live for 90 days and appears in search straight away.'
              : 'Once approved it goes live for 90 days and appears in search.'}
          </li>
          <li className="flex gap-2.5">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-600" aria-hidden />
            Every buyer who unlocks your contact becomes a lead in your dashboard, with their name
            and number.
          </li>
          <li className="flex gap-2.5">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-600" aria-hidden />
            Posting is free. We never take a commission on your sale or rent.
          </li>
        </ol>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2">
        <SummaryRow label="Listing" value={LISTING_TYPE_LABELS[(values.listing_type || 'sale') as 'sale' | 'rent' | 'pg']} />
        <SummaryRow label="Title" value={values.title || '—'} />
        <SummaryRow label="Location" value={[values.locality, values.city].filter(Boolean).join(', ') || '—'} />
        <SummaryRow label="Photos" value={`${imageCount} uploaded`} />
      </dl>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-field border border-ink-200 px-4 py-3">
      <dt className="text-xs text-ink-500">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-semibold text-ink-900">{value}</dd>
    </div>
  );
}
