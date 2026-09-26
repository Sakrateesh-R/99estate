import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="container-page max-w-3xl py-8 lg:py-10">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="mt-2 h-4 w-3/5 max-w-sm" />
      <div className="mt-5 flex gap-2">
        <Skeleton className="h-7 w-16 rounded-full" />
        <Skeleton className="h-7 w-20 rounded-full" />
      </div>
      <div className="mt-5 space-y-px overflow-hidden rounded-card border border-ink-200 bg-white">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex gap-3 p-4">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
