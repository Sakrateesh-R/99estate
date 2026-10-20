import { PanelSkeleton } from '@/components/ui/page-skeletons';

export default function Loading() {
  return (
    <div className="container-page py-6 lg:py-8">
      <PanelSkeleton rows={6} />
    </div>
  );
}
