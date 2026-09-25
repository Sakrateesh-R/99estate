import type { Metadata } from 'next';
import { HeartOff } from 'lucide-react';
import { PropertyCard } from '@/components/property/property-card';
import { EmptyState } from '@/components/ui/empty-state';
import { ButtonLink } from '@/components/ui/button';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { getCardMeta, PROPERTY_CARD_COLUMNS, type PropertyCardData } from '@/lib/properties/queries';

export const metadata: Metadata = {
  title: 'Saved properties',
  robots: { index: false, follow: false },
};

type SavedRow = { property_id: string; created_at: string; properties: PropertyCardData | null };

/** §14 — the buyer's shortlist. */
export default async function SavedPropertiesPage() {
  const user = await requireUser();
  const supabase = await createClient();

  // One embedded read rather than "fetch ids, then fetch properties" — the
  // second shape is the classic N+1 in disguise.
  const { data } = await supabase
    .from('saved_properties')
    .select(`property_id, created_at, properties ( ${PROPERTY_CARD_COLUMNS} )`)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .returns<SavedRow[]>();

  // RLS drops listings that are no longer public, which surfaces here as a
  // null embed. Those saves stay in the table but are not worth rendering.
  const properties = (data ?? []).map((row) => row.properties).filter((p): p is PropertyCardData => Boolean(p));

  // Everything here is saved by definition; photo counts and unlock state
  // still need the batched lookup.
  const { photoCounts, unlocked } = await getCardMeta(properties.map((p) => p.id));

  return (
    <div className="container-page py-8 lg:py-10">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Saved properties</h1>
      <p className="mt-1.5 text-[0.9375rem] text-ink-600">
        {properties.length === 0
          ? 'Nothing saved yet.'
          : `${properties.length} propert${properties.length === 1 ? 'y' : 'ies'} on your shortlist.`}
      </p>

      {properties.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<HeartOff className="size-6" />}
            title="Your shortlist is empty"
            description="Tap the heart on any listing to keep it here. Saving is free and so is everything else about browsing."
            action={<ButtonLink href="/properties">Browse properties</ButtonLink>}
          />
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {properties.map((property, index) => (
            <PropertyCard
              key={property.id}
              property={property}
              priority={index < 4}
              isSaved
              photoCount={photoCounts.get(property.id)}
              unlocked={unlocked.get(property.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
