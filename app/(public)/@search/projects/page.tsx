import { Suspense } from 'react';
import { HeaderSearchSlot } from '@/components/layout/header-slots';

/**
 * The same row on the projects results page. See the `properties` sibling for
 * why the Suspense boundary is here rather than in the header.
 */
export default function ProjectsSearchRow() {
  return (
    <Suspense fallback={null}>
      <HeaderSearchSlot />
    </Suspense>
  );
}
