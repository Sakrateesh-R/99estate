import { PropertyGridSkeleton, Skeleton } from '@/components/ui/skeleton';

/**
 * Fallback for the public pages that have no loader of their own — chiefly the
 * home page, which runs five queries before it can render anything.
 *
 * The static documents (about, pricing, terms, privacy) inherit this too. They
 * need no data and will normally paint straight through it, which costs nothing.
 */
export default function Loading() {
  return (
    <div>
      {/* Stands in for the hero, the tallest thing on the page. */}
      <Skeleton className="h-[22rem] w-full rounded-none sm:h-[26rem]" />

      <div className="container-page py-12 lg:py-16">
        <Skeleton className="h-8 w-2/5 max-w-sm" />
        <Skeleton className="mt-2 h-4 w-3/5 max-w-md" />
        <div className="mt-6">
          <PropertyGridSkeleton count={4} />
        </div>
      </div>
    </div>
  );
}
