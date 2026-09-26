import { ListingsPageSkeleton } from '@/components/ui/page-skeletons';

/**
 * The heaviest page on the site: a filtered search plus per-card metadata.
 * Also the one most often reached by changing a filter, where the previous
 * results sitting frozen on screen is actively misleading.
 */
export default function Loading() {
  return <ListingsPageSkeleton count={12} />;
}
