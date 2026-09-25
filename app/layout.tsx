import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ToastProvider } from '@/components/ui/toast';
import { getSiteUrl } from '@/lib/env';
import { SITE_NAME, SITE_TAGLINE } from '@/lib/constants';

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: `${SITE_NAME} — Find your next property`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_TAGLINE,
  applicationName: SITE_NAME,
  keywords: [
    'property',
    'real estate India',
    'flats for sale',
    'houses for rent',
    'apartments',
    'plots',
    'PG accommodation',
  ],
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'en_IN',
    title: `${SITE_NAME} — Find your next property`,
    description: SITE_TAGLINE,
  },
  twitter: {
    card: 'summary_large_image',
    title: `${SITE_NAME} — Find your next property`,
    description: SITE_TAGLINE,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  /**
   * Google Search Console ownership proof. Emitted as
   * `<meta name="google-site-verification">` in the head of every page.
   *
   * It lives in the root layout rather than only on the home page because
   * Search Console re-checks it periodically and will revoke access if it
   * disappears — and a token that only exists on one route is one refactor
   * away from vanishing. It is a public token, not a secret: it proves
   * ownership to Google and grants nothing to anyone who reads it.
   */
  verification: { google: 'uHnBw4jiUcvhMGouNpEGYzYw-IyZPzZhT_GQR7cmp6s' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0c6852',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body className="min-h-dvh antialiased">
        {/* Keyboard users land here first on every page. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-brand-700 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
        >
          Skip to content
        </a>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
