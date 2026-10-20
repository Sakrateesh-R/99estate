import Link from 'next/link';
import { Compass } from 'lucide-react';
import { UnitStatusBadge } from '@/components/ui/badge';
import { AREA_UNIT_LABELS, FACING_LABELS, UNIT_STATUS_LABELS } from '@/lib/constants';
import { formatPriceShort } from '@/lib/format';
import type { ProjectUnit } from '@/lib/projects/public';

/**
 * §27 — the unit-by-unit inventory, with a price and an availability per row.
 *
 * Public on purpose: a buyer being able to see that A-101 is available at
 * ₹62L and A-102 is sold is the whole point of a project page, and
 * `project_units_select` allows it for anyone who can see the project.
 *
 * One table for flats and plots, because they are one table in the database.
 * Which columns appear follows what the rows actually carry rather than the
 * project type — a layout has `plot_dimensions` and no bedrooms, a tower has
 * bedrooms and a floor, and asking the data is more reliable than asking the
 * enum.
 */
export function UnitTable({
  units,
  projectPath,
  selectedUnitId,
}: {
  units: ProjectUnit[];
  projectPath: string;
  selectedUnitId?: string | null;
}) {
  if (units.length === 0) return null;

  const hasBedrooms = units.some((u) => u.bedrooms != null);
  const hasDimensions = units.some((u) => u.plot_dimensions);
  const hasFacing = units.some((u) => u.facing);
  const hasFloor = units.some((u) => u.floor_number != null);

  return (
    <div className="overflow-x-auto rounded-card border border-ink-200 bg-white">
      <table className="w-full min-w-[40rem] text-sm">
        <caption className="sr-only">
          Units in this project, with price and availability
        </caption>
        <thead>
          <tr className="border-b border-ink-200 bg-ink-50 text-left text-xs uppercase tracking-wide text-ink-500">
            <th scope="col" className="px-3 py-3 font-semibold">Unit</th>
            {hasBedrooms ? (
              <th scope="col" className="px-3 py-3 font-semibold">Config</th>
            ) : null}
            {hasFloor ? (
              <th scope="col" className="px-3 py-3 font-semibold">Floor</th>
            ) : null}
            {hasDimensions ? (
              <th scope="col" className="px-3 py-3 font-semibold">Dimensions</th>
            ) : null}
            <th scope="col" className="px-3 py-3 text-right font-semibold">Area</th>
            {hasFacing ? (
              <th scope="col" className="px-3 py-3 font-semibold">Facing</th>
            ) : null}
            <th scope="col" className="px-3 py-3 text-right font-semibold">Price</th>
            <th scope="col" className="px-3 py-3 font-semibold">Status</th>
            <th scope="col" className="w-px whitespace-nowrap px-3 py-3 font-semibold">
              <span className="sr-only">Enquire</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {units.map((unit) => {
            const available = unit.status === 'available';
            const selected = unit.id === selectedUnitId;

            return (
              <tr
                key={unit.id}
                className={
                  selected
                    ? 'bg-brand-50'
                    : available
                      ? 'transition-colors hover:bg-ink-50/60'
                      : 'text-ink-500'
                }
              >
                <td className="px-3 py-3 font-semibold text-ink-900">
                  {unit.unit_number}
                  {unit.is_corner ? (
                    <span className="ml-1.5 text-[0.6875rem] font-normal text-ink-500">corner</span>
                  ) : null}
                </td>

                {hasBedrooms ? (
                  <td className="px-3 py-3">
                    {unit.unit_type ?? (unit.bedrooms != null ? `${unit.bedrooms} BHK` : '—')}
                  </td>
                ) : null}

                {hasFloor ? (
                  <td className="px-3 py-3 tabular-nums">
                    {unit.floor_number != null ? unit.floor_number : '—'}
                  </td>
                ) : null}

                {hasDimensions ? (
                  <td className="px-3 py-3 whitespace-nowrap">{unit.plot_dimensions ?? '—'}</td>
                ) : null}

                <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                  <UnitArea unit={unit} />
                </td>

                {hasFacing ? (
                  <td className="px-3 py-3 whitespace-nowrap">
                    {unit.facing ? (
                      <span className="inline-flex items-center gap-1">
                        <Compass className="size-3.5 text-ink-400" aria-hidden />
                        {FACING_LABELS[unit.facing]}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                ) : null}

                <td className="px-3 py-3 text-right font-semibold tabular-nums whitespace-nowrap text-ink-900">
                  {unit.price != null ? formatPriceShort(unit.price) : 'On request'}
                </td>

                <td className="px-3 py-3">
                  <UnitStatusBadge status={unit.status} />
                </td>

                <td className="w-px whitespace-nowrap px-3 py-3 text-right">
                  {/*
                    A link, not a button: the chosen unit lives in the URL so
                    the enquiry form above can read it on the server. That keeps
                    this a Server Component, survives a reload, and makes the
                    link shareable.

                    Only available units get one. "Enquire" next to a sold unit
                    invites a message nobody can act on.
                  */}
                  {available ? (
                    <Link
                      href={`${projectPath}?unit=${unit.id}#enquire`}
                      scroll={false}
                      className="text-xs font-semibold text-brand-700 hover:underline"
                    >
                      {selected ? 'Selected' : 'Enquire'}
                    </Link>
                  ) : (
                    <span className="text-xs text-ink-400">
                      {UNIT_STATUS_LABELS[unit.status]}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The area a buyer would ask about.
 *
 * `area_sqft` exists for sorting and range filters and is always comparable,
 * but it is not what the brochure says — a 2400 sqft plot sold in cents should
 * read in cents. So the native figure and unit are shown, and the generated
 * column stays out of the UI.
 */
function UnitArea({ unit }: { unit: ProjectUnit }) {
  const value = unit.built_up_area ?? unit.land_area ?? unit.carpet_area;
  if (value == null) return <>—</>;

  const trimmed = Number(value) % 1 === 0 ? String(Number(value)) : String(value);
  return (
    <>
      {trimmed} {AREA_UNIT_LABELS[unit.area_unit]}
    </>
  );
}
