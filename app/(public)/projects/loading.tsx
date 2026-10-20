import { ListingsPageSkeleton } from '@/components/ui/page-skeletons';

/**
 * Reuses the listings skeleton: the project grid is the same card shape at the
 * same breakpoints, and a second skeleton that drifted out of step with it
 * would be worse than one shared one.
 */
export default function Loading() {
  return <ListingsPageSkeleton count={9} />;
}
