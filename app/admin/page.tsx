import Link from 'next/link';
import { BadgeCheck, Building2, CheckCircle2, Flag, UserX, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { getQueueCounts } from '@/lib/admin/queries';
import { cn } from '@/lib/utils';

/**
 * §16 — what is waiting, and nothing else.
 *
 * An overview that also tried to be an analytics dashboard would bury the one
 * thing this screen exists for: telling an admin whether anything needs a
 * decision right now.
 */
export default async function AdminOverviewPage() {
  const c = await getQueueCounts();

  const queues = [
    {
      href: '/admin/properties',
      label: 'Listings awaiting review',
      value: c.pendingProperties,
      icon: Building2,
      hint: 'Sellers are waiting to go live',
    },
    {
      href: '/admin/reports',
      label: 'Open reports',
      value: c.openReports,
      icon: Flag,
      hint: 'Reported by buyers as fake, duplicate or wrong',
    },
    {
      href: '/admin/verification',
      label: 'Verification requests',
      value: c.pendingVerifications,
      icon: BadgeCheck,
      hint: 'Documents submitted for the verified badge',
    },
  ];

  const clear = queues.every((q) => q.value === 0);

  return (
    <div>
      {clear ? (
        <div className="flex items-start gap-3 rounded-card border border-emerald-200 bg-emerald-50 p-4">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />
          <div className="text-sm text-emerald-900">
            <p className="font-semibold">Nothing is waiting.</p>
            <p className="mt-0.5">Every queue is empty. New submissions will appear here.</p>
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {queues.map((q) => (
          <QueueCard key={q.href} {...q} />
        ))}
      </div>

      <h2 className="mt-10 text-sm font-semibold text-ink-900">Platform</h2>
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Live listings" value={c.liveProperties} icon={Building2} />
        <Stat label="Users" value={c.totalUsers} icon={Users} />
        <Stat
          label="Suspended"
          value={c.suspendedUsers}
          icon={UserX}
          href={c.suspendedUsers > 0 ? '/admin/users?status=suspended' : undefined}
        />
      </dl>
    </div>
  );
}

function QueueCard({
  href,
  label,
  value,
  icon: Icon,
  hint,
}: {
  href: string;
  label: string;
  value: number;
  icon: LucideIcon;
  hint: string;
}) {
  const waiting = value > 0;

  return (
    <Link
      href={href}
      className={cn(
        'block rounded-card border bg-white p-4 transition-colors',
        waiting ? 'border-amber-300 hover:border-amber-400' : 'border-ink-200 hover:border-ink-300',
      )}
    >
      <div className="flex items-center justify-between">
        <Icon className={cn('size-4', waiting ? 'text-amber-600' : 'text-ink-400')} aria-hidden />
        <span
          className={cn(
            'text-2xl font-bold tabular-nums',
            waiting ? 'text-amber-700' : 'text-ink-300',
          )}
        >
          {value}
        </span>
      </div>
      <p className="mt-2 text-sm font-medium text-ink-900">{label}</p>
      <p className="mt-0.5 text-xs text-ink-500">{waiting ? hint : 'Nothing waiting'}</p>
    </Link>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
  href,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  href?: string;
}) {
  const body = (
    <>
      <dt className="flex items-center gap-1.5 text-xs text-ink-500">
        <Icon className="size-3.5 text-ink-400" aria-hidden />
        {label}
      </dt>
      <dd className="mt-1 text-xl font-bold tabular-nums text-ink-900">
        {value.toLocaleString('en-IN')}
      </dd>
    </>
  );

  return href ? (
    <Link href={href} className="rounded-card border border-ink-200 bg-white p-4 hover:border-ink-300">
      {body}
    </Link>
  ) : (
    <div className="rounded-card border border-ink-200 bg-white p-4">{body}</div>
  );
}
