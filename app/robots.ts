import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/env';

export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrl();

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Authenticated surfaces and API routes carry nothing a crawler should
        // index, and `/property/*?` style filter permutations are handled by
        // per-page robots directives instead.
        disallow: ['/dashboard', '/admin', '/api/', '/auth/', '/login', '/complete-profile', '/saved'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
