'use client';

import { ErrorPanel } from '@/components/ui/error-panel';

export default function PublicError({
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
      description="This page failed to load. It is usually temporary — try again, or browse from the home page."
      backHref="/properties"
      backLabel="Browse properties"
    />
  );
}
