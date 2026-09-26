'use client';

import { ErrorPanel } from '@/components/ui/error-panel';

export default function AdminError({
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
      title="This queue failed to load"
      description="Moderation data could not be fetched. The digest below matches the server log entry."
      backHref="/admin"
      backLabel="Admin overview"
    />
  );
}
