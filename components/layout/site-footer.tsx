import Link from 'next/link';
import { LogoMark } from '@/components/layout/logo';
import { FREE_DAILY_UNLOCKS, PAID_UNLOCK_PRICE } from '@/lib/constants';

const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: 'Buy',
    links: [
      { href: '/properties?listing=sale&type=apartment', label: 'Apartments' },
      { href: '/properties?listing=sale&type=independent_house', label: 'Independent houses' },
      { href: '/properties?listing=sale&type=villa', label: 'Villas' },
      { href: '/properties?listing=sale&type=residential_plot', label: 'Plots & land' },
    ],
  },
  {
    title: 'Rent',
    links: [
      { href: '/properties?listing=rent&type=apartment', label: 'Rental apartments' },
      { href: '/properties?listing=rent&type=independent_house', label: 'Rental houses' },
      { href: '/properties?listing=pg', label: 'PG & co-living' },
      { href: '/properties?listing=rent&type=office_space', label: 'Office space' },
    ],
  },
  {
    title: 'Sell',
    links: [
      { href: '/dashboard/properties/new', label: 'Post a property free' },
      { href: '/dashboard', label: 'Seller dashboard' },
      { href: '/dashboard/leads', label: 'My leads' },
      { href: '/how-it-works', label: 'How it works' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/about', label: 'About 99Estate' },
      { href: '/pricing', label: 'Pricing' },
      { href: '/terms', label: 'Terms of use' },
      { href: '/privacy', label: 'Privacy policy' },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-ink-200 bg-white">
      <div className="container-page py-12 lg:py-16">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,3fr)]">
          <div className="max-w-sm">
            <div className="flex items-center gap-2.5">
              <LogoMark />
              <span className="font-display text-xl font-bold tracking-tight">
                <span className="text-brand-700">99</span>
                <span className="text-ink-950">Estate</span>
              </span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-ink-600">
              A property marketplace that does not charge you to look. Browse every listing in full
              for free, unlock {FREE_DAILY_UNLOCKS} seller contacts free every day, and pay just ₹
              {PAID_UNLOCK_PRICE} for each extra contact after that.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {COLUMNS.map((column) => (
              <div key={column.title}>
                <h3 className="text-[0.8125rem] font-semibold uppercase tracking-wider text-ink-950">
                  {column.title}
                </h3>
                <ul className="mt-3 space-y-2.5">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-sm text-ink-600 transition-colors hover:text-brand-700"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-ink-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-ink-500">
            © {new Date().getFullYear()} 99Estate. All rights reserved.
          </p>
          <p className="text-xs text-ink-500">
            Listings are posted by sellers. 99Estate does not broker or guarantee any transaction.
          </p>
        </div>
      </div>
    </footer>
  );
}
