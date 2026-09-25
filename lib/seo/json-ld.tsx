import * as React from 'react';
import { getSiteUrl } from '@/lib/env';
import { SITE_NAME, SITE_TAGLINE } from '@/lib/constants';
import { LEGAL } from '@/lib/legal';

/**
 * §23 — structured data.
 *
 * Metadata tells a crawler what a page is called; this tells it what the page
 * *is*. For property search that is the difference between a blue link and a
 * result carrying price, location and photos — and breadcrumbs instead of a
 * raw URL.
 *
 * One rule applies throughout: nothing here may contain a seller's name or
 * phone number. Structured data is published for machines to read in bulk,
 * which makes it the easiest place to leak the exact thing the whole contact
 * unlock model exists to protect.
 */

/**
 * Renders a JSON-LD block.
 *
 * `JSON.stringify` output goes inside a `<script>`, so a `<` in any field —
 * a listing title containing "<3", say — would close the tag early and turn
 * data into markup. Escaping it is what keeps this from being an injection
 * point, since the values come from user-authored listings.
 */
export function JsonLd({ data }: { data: object }) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}

export function organizationJsonLd() {
  const base = getSiteUrl();

  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${base}/#organization`,
    name: SITE_NAME,
    url: base,
    description: SITE_TAGLINE,
    // Raster, not the SVG favicon: Google does not accept SVG for an
    // Organization logo. Regenerate with `npm run gen:logo`.
    logo: `${base}/logo.png`,
    image: `${base}/logo.png`,
    address: {
      '@type': 'PostalAddress',
      streetAddress: '282/9, Rasi Nagar, Chinna Andan Kovil Road',
      addressLocality: LEGAL.jurisdictionCity,
      addressRegion: LEGAL.jurisdictionState,
      addressCountry: 'IN',
    },
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: LEGAL.supportEmail,
      areaServed: 'IN',
      availableLanguage: ['en', 'ta'],
    },
  };
}

/**
 * Declares the site and its search endpoint.
 *
 * The SearchAction is what lets Google show a search box for the brand in its
 * own results. It has to point at a URL that really performs a search, so it
 * targets `/properties?q=` rather than one of the landing pages.
 */
export function websiteJsonLd() {
  const base = getSiteUrl();

  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${base}/#website`,
    name: SITE_NAME,
    url: base,
    description: SITE_TAGLINE,
    publisher: { '@id': `${base}/#organization` },
    inLanguage: 'en-IN',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${base}/properties?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };
}

export type Crumb = { name: string; path: string };

/**
 * Breadcrumbs, which Google renders in place of the bare URL.
 *
 * The visible trail and this list must describe the same path — a mismatch is
 * treated as misleading markup, not as a helpful extra.
 */
export function breadcrumbJsonLd(crumbs: Crumb[]) {
  const base = getSiteUrl();

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: `${base}${crumb.path}`,
    })),
  };
}

/**
 * The listings on a landing page, in the order they are shown.
 *
 * Only ever a URL and a position. The listing's own page carries the full
 * RealEstateListing markup, and repeating price and address here would risk
 * the two drifting apart and contradicting each other.
 */
export function itemListJsonLd(input: { name: string; paths: string[] }) {
  const base = getSiteUrl();

  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: input.name,
    numberOfItems: input.paths.length,
    itemListElement: input.paths.map((path, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: `${base}${path}`,
    })),
  };
}

export function faqJsonLd(items: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };
}
