'use client';

import { ErrorPanel } from '@/components/ui/error-panel';
import './globals.css';

/**
 * The last resort: an error in the root layout itself, where no other boundary
 * is mounted. It has to render its own <html> and <body> because the layout that
 * normally provides them is the thing that failed, and it imports the stylesheet
 * for the same reason.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en-IN">
      <body className="min-h-dvh bg-ink-50 antialiased">
        <ErrorPanel
          error={error}
          reset={reset}
          title="99Estate could not load"
          description="Something failed before the page could start. Trying again usually works."
        />
      </body>
    </html>
  );
}
