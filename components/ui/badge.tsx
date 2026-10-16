import * as React from 'react';
import { BadgeCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Enums } from '@/types/database.types';
import {
  PROPERTY_STATUS_LABELS,
  LEAD_STATUS_LABELS,
  PROJECT_STATUS_LABELS,
  UNIT_STATUS_LABELS,
  ENTITY_VERIFICATION_LABELS,
  PROGRESS_VERIFICATION_LABELS,
} from '@/lib/constants';

type Tone = 'neutral' | 'brand' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

const TONES: Record<Tone, string> = {
  neutral: 'bg-ink-100 text-ink-700 ring-ink-200',
  brand: 'bg-brand-50 text-brand-800 ring-brand-200',
  accent: 'bg-accent-50 text-accent-800 ring-accent-200',
  success: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  danger: 'bg-red-50 text-red-700 ring-red-200',
  info: 'bg-sky-50 text-sky-800 ring-sky-200',
};

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
}

const PROPERTY_STATUS_TONE: Record<Enums<'property_status'>, Tone> = {
  draft: 'neutral',
  pending: 'warning',
  published: 'success',
  paused: 'neutral',
  sold: 'info',
  rented: 'info',
  expired: 'neutral',
  rejected: 'danger',
};

export function PropertyStatusBadge({ status }: { status: Enums<'property_status'> }) {
  return <Badge tone={PROPERTY_STATUS_TONE[status]}>{PROPERTY_STATUS_LABELS[status]}</Badge>;
}

const LEAD_STATUS_TONE: Record<Enums<'lead_status'>, Tone> = {
  new: 'brand',
  contacted: 'info',
  interested: 'success',
  site_visit: 'accent',
  negotiation: 'warning',
  closed: 'success',
  not_interested: 'neutral',
};

export function LeadStatusBadge({ status }: { status: Enums<'lead_status'> }) {
  return <Badge tone={LEAD_STATUS_TONE[status]}>{LEAD_STATUS_LABELS[status]}</Badge>;
}

const PROJECT_STATUS_TONE: Record<Enums<'project_status'>, Tone> = {
  upcoming: 'neutral',
  pre_launch: 'info',
  new_launch: 'accent',
  under_construction: 'warning',
  near_completion: 'warning',
  ready_to_move: 'success',
  completed: 'success',
  sold_out: 'neutral',
};

export function ProjectStatusBadge({ status }: { status: Enums<'project_status'> }) {
  return <Badge tone={PROJECT_STATUS_TONE[status]}>{PROJECT_STATUS_LABELS[status]}</Badge>;
}

const UNIT_STATUS_TONE: Record<Enums<'unit_status'>, Tone> = {
  available: 'success',
  hold: 'warning',
  booked: 'info',
  sold: 'neutral',
  blocked: 'danger',
};

export function UnitStatusBadge({ status }: { status: Enums<'unit_status'> }) {
  return <Badge tone={UNIT_STATUS_TONE[status]}>{UNIT_STATUS_LABELS[status]}</Badge>;
}

/**
 * A company's or project's verification state.
 *
 * Unlike `VerifiedBadge` this one is not silent outside the happy path, because
 * `suspended` and `rejected` are states the *owner* has to know about — they
 * mean the project is off the market. `unverified` still renders nothing: a
 * chip on every new company would be noise, and it would read as a judgement
 * rather than as "nobody has looked yet".
 */
export function EntityVerificationBadge({
  status,
  className,
}: {
  status: Enums<'entity_verification_status'>;
  className?: string;
}) {
  if (status === 'unverified') return null;

  const tone: Tone =
    status === 'verified'
      ? 'brand'
      : status === 'pending'
        ? 'info'
        : status === 'rejected'
          ? 'warning'
          : 'danger';

  return (
    <Badge tone={tone} className={className}>
      {status === 'verified' ? <BadgeCheck className="size-3.5" aria-hidden /> : null}
      {ENTITY_VERIFICATION_LABELS[status]}
    </Badge>
  );
}

/**
 * §8 — the construction-progress claim, labelled with who is making it.
 *
 * Never prints a bare "Verified" for `promoter_reported`. The whole reason
 * `progress_verification` is a separate column from the percentage is that a
 * builder saying 60% and 99Estate confirming 60% are different claims, and only
 * `admin_verify_project_progress` can produce the second one.
 */
export function ProgressSourceBadge({
  status,
}: {
  status: Enums<'progress_verification_status'>;
}) {
  return (
    <Badge tone={status === 'admin_verified' ? 'brand' : 'neutral'}>
      {status === 'admin_verified' ? <BadgeCheck className="size-3.5" aria-hidden /> : null}
      {PROGRESS_VERIFICATION_LABELS[status]}
    </Badge>
  );
}

/** Shown only for `verified` — an "unverified" chip on every other listing would be noise. */
export function VerifiedBadge({
  status,
  className,
}: {
  status: Enums<'verification_status'>;
  className?: string;
}) {
  if (status !== 'verified') return null;
  return (
    <Badge tone="brand" className={className}>
      <BadgeCheck className="size-3.5" aria-hidden />
      Verified
    </Badge>
  );
}
