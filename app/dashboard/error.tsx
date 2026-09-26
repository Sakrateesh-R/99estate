'use client';

import { ErrorPanel } from '@/components/ui/error-panel';

/**
 * Sits inside the dashboard layout, so the nav stays put and only the panel is
 * replaced. Nothing a seller had typed is recoverable from here, which is worth
 * saying rather than implying with a bare "try again".
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorPanel
      error={error}
      reset={reset}
      description="This screen failed to load. Trying again usually works. If you were part-way through a listing, your last saved draft is safe."
      backHref="/dashboard/properties"
      backLabel="My properties"
    />
  );
}
