import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { OnBehalfForm } from '@/components/admin/on-behalf-form';
import { getActiveCities } from '@/lib/properties/queries';
import { requireAdmin } from '@/lib/auth/session';

/**
 * §12 — post on behalf of an owner, agent or builder.
 *
 * For walk-ins and phone enquiries: somebody who wants to list but will not
 * sign up themselves. What comes out is an ordinary listing — it belongs to
 * them, it goes through moderation, its contact unlock costs the buyer the same
 * ₹9, and it expires on the same 90-day clock. The only difference recorded is
 * `posted_by`, which says who typed it in.
 */
export default async function AdminNewListingPage() {
  await requireAdmin();
  const cities = await getActiveCities();

  return (
    <div>
      <Link
        href="/admin/listings"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 transition-colors hover:text-ink-900"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Listings posted on behalf
      </Link>

      <h1 className="mt-4 text-xl font-bold tracking-tight text-ink-950">
        Post on behalf of a seller
      </h1>
      <p className="mt-1 text-sm text-ink-600">
        For an owner, broker or builder who gave you their details but will not be signing up
        themselves.
      </p>

      <div className="mt-7 rounded-card border border-ink-200 bg-white p-5 sm:p-6">
        <OnBehalfForm cities={cities} />
      </div>
    </div>
  );
}
