import { Skeleton, PropertyGridSkeleton } from '@/components/ui/skeleton';

/**
 * Shells for route-level `loading.tsx` files.
 *
 * Every page on this site waits on a Supabase round trip, and until these
 * existed a navigation showed the previous page frozen until the data arrived —
 * no spinner, no skeleton, nothing to say the click had registered. On a slow
 * connection that is indistinguishable from a dead link, and the usual response
 * is to click again.
 *
 * Shaped to match the real layouts closely enough that content does not jump
 * when it swaps in. A skeleton that reflows the moment it is replaced draws more
 * attention to the wait than a plain spinner would.
 */

/** Page heading plus a line or two of blurb. */
function HeadingSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-8 w-2/5 max-w-sm" />
      <Skeleton className="h-4 w-3/5 max-w-md" />
    </div>
  );
}

/** /properties, /saved and the landing pages: header, filter bar, card grid. */
export function ListingsPageSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="container-page py-8 lg:py-10">
      <HeadingSkeleton />

      {/* The filter row is the tallest thing above the grid; leaving it out
          would let the whole grid jump upward on arrival. */}
      <div className="mt-6 flex flex-wrap gap-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-28 rounded-field" />
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between gap-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-40 rounded-field" />
      </div>

      <div className="mt-6">
        <PropertyGridSkeleton count={count} />
      </div>
    </div>
  );
}

/** A single listing: gallery, then details beside the contact card. */
export function PropertyDetailSkeleton() {
  return (
    <div className="container-page py-6 lg:py-8">
      <Skeleton className="h-4 w-56" />

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4 sm:grid-rows-2">
        <Skeleton className="aspect-[4/3] w-full sm:col-span-3 sm:row-span-2 sm:aspect-auto sm:h-[26rem]" />
        <Skeleton className="hidden sm:block sm:h-[12.6rem]" />
        <Skeleton className="hidden sm:block sm:h-[12.6rem]" />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <div className="space-y-3">
            <Skeleton className="h-9 w-3/5" />
            <Skeleton className="h-5 w-2/5" />
          </div>

          <div className="grid grid-cols-2 gap-4 rounded-card border border-ink-200 bg-white p-5 sm:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-5 w-20" />
              </div>
            ))}
          </div>

          <div className="space-y-3 rounded-card border border-ink-200 bg-white p-5">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        </div>

        {/* The contact card is the point of the page, so it holds its place. */}
        <div className="space-y-4 rounded-card border border-ink-200 bg-white p-5 lg:sticky lg:top-24 lg:self-start">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-12 w-full rounded-field" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    </div>
  );
}

/**
 * The content area inside the dashboard and admin shells.
 *
 * Those layouts render their own navigation immediately — only the panel beside
 * it is waiting — so this deliberately does not repeat the page chrome.
 */
export function PanelSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-5">
      <HeadingSkeleton />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-20 rounded-card" />
        ))}
      </div>

      <div className="space-y-3">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-4 rounded-card border border-ink-200 bg-white p-4">
            <Skeleton className="size-16 shrink-0 rounded-field" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
            <Skeleton className="h-9 w-24 shrink-0 rounded-field" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Long-form pages that are mostly text. */
export function ProseSkeleton() {
  return (
    <div className="container-page py-10 lg:py-14">
      <div className="max-w-3xl space-y-6">
        <Skeleton className="h-10 w-2/5" />
        <Skeleton className="h-4 w-1/4" />
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="space-y-2.5">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        ))}
      </div>
    </div>
  );
}
