import Link from 'next/link';
import { ArrowRight, Building2 } from 'lucide-react';
import { PropertyCard } from '@/components/property/property-card';
import { EmptyState } from '@/components/ui/empty-state';
import { ButtonLink } from '@/components/ui/button';
import type { PropertyCardData, UnlockedContact } from '@/lib/properties/queries';

/**
 * Titled grid of listings used by the home page rails.
 *
 * On mobile it becomes a horizontal snap-scroller: a vertical stack of eight
 * cards would bury everything below it, and swiping is the expected gesture
 * for a "featured" rail.
 */
export function PropertyRail({
  title,
  description,
  properties,
  viewAllHref,
  viewAllLabel = 'View all',
  emptyTitle,
  emptyDescription,
  priority = false,
  photoCounts,
  savedIds,
  unlocked,
}: {
  title: string;
  description?: string;
  properties: PropertyCardData[];
  viewAllHref?: string;
  viewAllLabel?: string;
  /**
   * Omit both to make the rail disappear when it has nothing to show, instead
   * of announcing a heading over an empty state. Supply them for a rail whose
   * absence would leave the page with no properties on it at all.
   */
  emptyTitle?: string;
  emptyDescription?: string;
  priority?: boolean;
  photoCounts?: Map<string, number>;
  savedIds?: Set<string>;
  unlocked?: Map<string, UnlockedContact>;
}) {
  /**
   * A heading with nothing under it is worse than no section: it takes up the
   * space where a buyer was looking for properties in order to tell them there
   * are none. A caller that has something to say in that case says it.
   */
  if (properties.length === 0 && !emptyTitle) return null;

  return (
    <section className="container-page py-12 lg:py-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
          {description ? <p className="mt-2 text-[0.9375rem] text-ink-600">{description}</p> : null}
        </div>

        {viewAllHref && properties.length > 0 ? (
          <Link
            href={viewAllHref}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 transition-colors hover:text-brand-900"
          >
            {viewAllLabel}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        ) : null}
      </div>

      {properties.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<Building2 className="size-6" />}
            // Non-null: the early return above covers the absent case.
            title={emptyTitle!}
            description={emptyDescription}
            action={
              <ButtonLink href="/dashboard/properties/new" size="sm">
                Post a property — free
              </ButtonLink>
            }
          />
        </div>
      ) : (
        <div className="scrollbar-none -mx-4 mt-6 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-5 sm:overflow-visible sm:px-0 lg:grid-cols-3 xl:grid-cols-4">
          {properties.map((property, index) => (
            <PropertyCard
              key={property.id}
              property={property}
              priority={priority && index < 2}
              isSaved={savedIds?.has(property.id)}
              photoCount={photoCounts?.get(property.id)}
              unlocked={unlocked?.get(property.id)}
              className="w-[min(20rem,78%)] shrink-0 snap-start sm:w-auto sm:shrink"
            />
          ))}
        </div>
      )}
    </section>
  );
}
