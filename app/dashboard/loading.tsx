import { PanelSkeleton } from '@/components/ui/page-skeletons';

/**
 * Covers every page under /dashboard that does not define its own.
 *
 * Sits inside the dashboard layout, so the nav and the seller's own chrome stay
 * on screen and only the panel beside them waits — which is the honest picture
 * of what is actually loading.
 */
export default function Loading() {
  return <PanelSkeleton />;
}
