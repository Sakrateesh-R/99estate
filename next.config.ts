import type { NextConfig } from 'next';

/**
 * Supabase Storage lives on `<project-ref>.supabase.co`. We derive the hostname
 * from the public env var so the image allow-list follows the environment
 * instead of being hardcoded per deployment.
 */
const supabaseHost = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Pin file tracing to this project. Without it Next walks up and can pick an
  // unrelated lockfile higher in the filesystem as the workspace root, which
  // bloats (or breaks) the standalone trace.
  outputFileTracingRoot: process.cwd(),
  images: {
    /**
     * §13 — Supabase resizes its own objects; see lib/images/supabase-loader.ts.
     *
     * A custom loader replaces URL generation for *every* image, which is why
     * the loader hands anything that is not a public Supabase object back to
     * `/_next/image`. The logo assets and Google avatars therefore behave
     * exactly as before.
     *
     * `formats` is deliberately kept: it still applies to everything the
     * built-in optimizer handles. Supabase does its own negotiation and
     * returns WebP when the browser's `Accept` header offers it — verified
     * against this project, not assumed.
     */
    loader: 'custom',
    loaderFile: './lib/images/supabase-loader.ts',
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      // Google account avatars returned by Supabase Auth.
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      ...(supabaseHost
        ? ([{ protocol: 'https', hostname: supabaseHost, pathname: '/storage/v1/object/public/**' }] as const)
        : []),
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
        ],
      },
    ];
  },
};

export default nextConfig;
