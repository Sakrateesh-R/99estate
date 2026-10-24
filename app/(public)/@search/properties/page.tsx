import { Suspense } from 'react';
import { HeaderSearchSlot } from '@/components/layout/header-slots';

/**
 * The persistent search row, on the property results page.
 *
 * Kept in its own Suspense boundary for the reason it always was:
 * `useSearchParams` inside `HeaderSearch` needs one or the whole tree opts
 * into client-side rendering, and the city list streams in here rather than
 * blocking the header above it.
 */
export default function PropertiesSearchRow() {
  return (
    <Suspense fallback={null}>
      <HeaderSearchSlot />
    </Suspense>
  );
}
