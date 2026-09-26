import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="container-page max-w-lg py-12">
      <Skeleton className="h-8 w-3/5" />
      <Skeleton className="mt-3 h-4 w-full" />
      <div className="mt-8 space-y-5">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-11 w-full rounded-field" />
          </div>
        ))}
        <Skeleton className="h-11 w-full rounded-field" />
      </div>
    </div>
  );
}
