import {
  BadgeCheck,
  Bell,
  CalendarClock,
  CheckCircle2,
  Heart,
  IndianRupee,
  Inbox,
  PhoneCall,
  XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Enums } from '@/types/database.types';

/**
 * The type decides the icon and the colour, because the kind of news is the
 * first thing to read. "Your property is live" and "Listing needs changes" are
 * otherwise the same shape of row, and they are not remotely the same news.
 *
 * Every member of `notification_type` is listed: a Record over the enum means
 * adding a type to the database fails the build here rather than silently
 * rendering as a generic bell.
 */
const VISUALS: Record<Enums<'notification_type'>, { icon: LucideIcon; className: string }> = {
  payment: { icon: IndianRupee, className: 'bg-emerald-50 text-emerald-700' },
  contact_unlock: { icon: PhoneCall, className: 'bg-brand-50 text-brand-700' },
  property_approved: { icon: CheckCircle2, className: 'bg-emerald-50 text-emerald-700' },
  property_rejected: { icon: XCircle, className: 'bg-red-50 text-red-700' },
  new_lead: { icon: Inbox, className: 'bg-brand-50 text-brand-700' },
  property_expiry: { icon: CalendarClock, className: 'bg-amber-50 text-amber-700' },
  verification: { icon: BadgeCheck, className: 'bg-brand-50 text-brand-700' },
  saved_property: { icon: Heart, className: 'bg-accent-50 text-accent-700' },
  system: { icon: Bell, className: 'bg-ink-100 text-ink-600' },
};

export function NotificationIcon({
  type,
  className,
}: {
  type: Enums<'notification_type'>;
  className?: string;
}) {
  // Falls back rather than throwing: a row written by a migration newer than
  // this deploy should still render.
  const visual = VISUALS[type] ?? VISUALS.system;
  const Icon = visual.icon;

  return (
    <span
      className={cn('grid size-9 shrink-0 place-items-center rounded-full', visual.className, className)}
    >
      <Icon className="size-4" aria-hidden />
    </span>
  );
}
