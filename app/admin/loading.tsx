import { PanelSkeleton } from '@/components/ui/page-skeletons';

/**
 * Covers every admin queue. The nav keeps its badge counts from the layout, so
 * an admin can still see what is waiting while the queue itself loads.
 */
export default function Loading() {
  return <PanelSkeleton rows={5} />;
}
