import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { JsonLd, organizationJsonLd, websiteJsonLd } from '@/lib/seo/json-ld';

/**
 * Chrome for every visitor-facing page. The dashboard and admin console have
 * their own shells, so this layout stays free of authenticated-only furniture.
 */
export default function PublicLayout({
  children,
  search,
}: {
  children: React.ReactNode;
  /**
   * The header's search row, as a parallel route (`app/(public)/@search`).
   *
   * A layout cannot see the path, and the header cannot either, so the route
   * itself decides: `@search/properties` and `@search/projects` render the
   * row, and `@search/default` renders nothing. That is what keeps the city
   * and place queries off every other page rather than running them and
   * discarding the result in a client component.
   */
  search: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      {/*
        Identity markup, emitted once for the whole public site rather than
        per page. Both carry a stable @id so the page-level graphs can point
        at them instead of restating the publisher on every listing. The
        WebSite node is also what declares the search endpoint, which is
        site-wide by definition.

        Deliberately not in the root layout: the dashboard and login screens
        are noindex, and describing the organisation on a page no crawler
        reads is pure payload.
      */}
      <JsonLd data={organizationJsonLd()} />
      <JsonLd data={websiteJsonLd()} />

      <SiteHeader searchSlot={search} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
