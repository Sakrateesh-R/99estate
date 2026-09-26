import { cn } from '@/lib/utils';

/**
 * §16 — the two charts on the insights page.
 *
 * One hue for every data mark. Both charts show a single measure, so there is
 * nothing for a second colour to mean, and a legend would only restate the
 * title. The accent amber stays reserved for "this needs attention" elsewhere in
 * the console rather than being borrowed as a series colour.
 *
 * No charting library: these are a CSS grid and an SVG, which is less code than
 * configuring one would be and ships nothing to the browser.
 */

/** The single data hue — brand-600. Validated against the light surface. */
const MARK = '#0f8364';

function formatDayLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(`${iso}T12:00:00+05:30`));
}

/**
 * Daily unique visitors, last 14 IST days.
 *
 * Bars rather than a line: these are counts for discrete days, not samples of a
 * continuous quantity, and at fourteen points a line would imply a smoothness
 * the data does not have.
 */
export function ViewsTrend({ data }: { data: { date: string; views: number }[] }) {
  const peak = Math.max(...data.map((d) => d.views), 1);
  const total = data.reduce((sum, d) => sum + d.views, 0);

  return (
    <section className="rounded-card border border-ink-200 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink-900">Unique visitors per day</h2>
        <p className="text-xs text-ink-500">Last 14 days · {total.toLocaleString('en-IN')} total</p>
      </div>

      {total === 0 ? (
        <p className="mt-6 text-sm text-ink-500">
          No listing views recorded yet. Your own views of your own listings are deliberately not
          counted, so this stays empty until someone else opens one.
        </p>
      ) : (
        <>
          {/*
            `items-end` anchors every bar to a shared baseline, which is what makes
            the heights comparable at a glance. gap-[2px] is the surface spacer
            between adjacent marks.
          */}
          <div className="mt-5 flex h-40 items-end gap-[2px]" role="presentation">
            {data.map((day) => {
              // A day with views never renders as nothing: 2% is the floor, so a
              // quiet day reads as "very few" rather than "no data".
              const height = day.views === 0 ? 0 : Math.max(2, (day.views / peak) * 100);

              return (
                <div key={day.date} className="group relative flex h-full flex-1 items-end">
                  {day.views > 0 ? (
                    <div
                      className="w-full rounded-t-[4px] transition-opacity group-hover:opacity-80"
                      style={{ height: `${height}%`, backgroundColor: MARK }}
                      // Native tooltip: no JavaScript, and it works on a keyboard
                      // focus in most browsers too.
                      title={`${formatDayLabel(day.date)} — ${day.views} unique visitor${day.views === 1 ? '' : 's'}`}
                    />
                  ) : (
                    <div
                      className="h-px w-full rounded-full bg-ink-200"
                      title={`${formatDayLabel(day.date)} — no visitors`}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Only the ends are labelled. A tick under all fourteen bars would
              collide on a phone and none of them would be read. */}
          <div className="mt-2 flex justify-between text-[0.6875rem] text-ink-400">
            <span>{formatDayLabel(data[0]!.date)}</span>
            <span>{formatDayLabel(data[data.length - 1]!.date)}</span>
          </div>
        </>
      )}

      {/* The same numbers, for anyone not reading the bars. */}
      <table className="sr-only">
        <caption>Unique visitors per day, last 14 days</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Unique visitors</th>
          </tr>
        </thead>
        <tbody>
          {data.map((day) => (
            <tr key={day.date}>
              <td>{formatDayLabel(day.date)}</td>
              <td>{day.views}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/**
 * Views → unlocks → leads.
 *
 * Horizontal bars on one shared scale rather than a tapering funnel shape. A
 * trapezoid encodes each stage twice — width and area — and the area is
 * misleading, because the stages are counts rather than a volume being poured
 * through something.
 */
export function ConversionFunnel({
  views,
  unlocks,
  leads,
}: {
  views: number;
  unlocks: number;
  leads: number;
}) {
  const stages = [
    { label: 'Listing views', value: views, note: 'unique visitors, last 30 days' },
    { label: 'Contacts unlocked', value: unlocks, note: 'free and paid' },
    { label: 'Leads created', value: leads, note: 'one per settled unlock' },
  ];

  const peak = Math.max(views, 1);
  const rate = (from: number, to: number) => (from === 0 ? null : (to / from) * 100);

  const viewToUnlock = rate(views, unlocks);
  const unlockToLead = rate(unlocks, leads);

  return (
    <section className="rounded-card border border-ink-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-ink-900">View to lead</h2>
      <p className="mt-0.5 text-xs text-ink-500">
        Where interest turns into a connection somebody paid for.
      </p>

      <div className="mt-5 space-y-4">
        {stages.map((stage) => (
          <div key={stage.label}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium text-ink-800">{stage.label}</p>
              <p className="text-sm font-bold tabular-nums text-ink-950">
                {stage.value.toLocaleString('en-IN')}
              </p>
            </div>
            <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-ink-100">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${stage.value === 0 ? 0 : Math.max(1.5, (stage.value / peak) * 100)}%`,
                  backgroundColor: MARK,
                }}
                title={`${stage.label}: ${stage.value}`}
              />
            </div>
            <p className="mt-1 text-[0.6875rem] text-ink-400">{stage.note}</p>
          </div>
        ))}
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-ink-100 pt-4">
        <div>
          <dt className="text-xs text-ink-500">View → unlock</dt>
          <dd className="mt-0.5 text-lg font-bold tabular-nums text-ink-950">
            {viewToUnlock === null ? '—' : `${viewToUnlock.toFixed(1)}%`}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-500">Unlock → lead</dt>
          <dd className="mt-0.5 text-lg font-bold tabular-nums text-ink-950">
            {unlockToLead === null ? '—' : `${unlockToLead.toFixed(0)}%`}
          </dd>
        </div>
      </dl>
    </section>
  );
}

/** A headline number. Not a chart, because one value never needs one. */
export function StatTile({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'neutral' | 'brand';
}) {
  return (
    <div className="rounded-card border border-ink-200 bg-white p-4">
      <p className="text-xs text-ink-500">{label}</p>
      <p
        className={cn(
          'mt-1 text-2xl font-bold tabular-nums',
          tone === 'brand' ? 'text-brand-700' : 'text-ink-950',
        )}
      >
        {value}
      </p>
      {sub ? <p className="mt-0.5 text-[0.6875rem] text-ink-400">{sub}</p> : null}
    </div>
  );
}
