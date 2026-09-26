import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * The brand assets, cut from one master by `scripts/generate-logo.mjs`.
 *
 * Both are served through `next/image`, which resizes them and converts to
 * WebP/AVIF on the way out — the sources are large PNGs so that they stay sharp
 * on a high-density screen, and nothing ever downloads them at full size.
 *
 * Intrinsic dimensions are declared on every use. They are what reserves the
 * space before the bytes arrive, and a logo that pops into a collapsed header is
 * one of the easier ways to fail Cumulative Layout Shift on every page at once.
 */

/** Natural size of `public/logo.png`, the trimmed lockup. */
const LOCKUP = { width: 1821, height: 422 };
/** Natural size of the square 99 mark. */
const MARK = { width: 574, height: 574 };

/**
 * The 99 mark alone.
 *
 * For places too small or too square for the full lockup — the footer, and
 * anywhere the wordmark would be set beside other text and compete with it.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <Image
      src="/logo-mark.png"
      alt=""
      width={MARK.width}
      height={MARK.height}
      className={cn('size-8 w-auto', className)}
      // Decorative wherever it appears: every use sits next to the site name in
      // text, so announcing it again would only repeat that to a screen reader.
      aria-hidden
    />
  );
}

export function Logo({
  className,
  href = '/',
  showWordmark = true,
  priority = false,
}: {
  className?: string;
  href?: string;
  /** False renders the square mark instead of the full lockup. */
  showWordmark?: boolean;
  /**
   * Set on the header, where the logo is within the first viewport on every
   * page and is often the largest element to paint.
   */
  priority?: boolean;
}) {
  return (
    <Link href={href} className={cn('inline-flex items-center', className)} aria-label="99Estate home">
      {showWordmark ? (
        <Image
          src="/logo.png"
          alt="99Estate — buy, sell, rent, explore"
          width={LOCKUP.width}
          height={LOCKUP.height}
          priority={priority}
          // Height-led, width auto: the lockup is 4.3:1, so constraining the
          // height is what keeps it aligned with everything else on the row.
          className="h-9 w-auto sm:h-10"
          sizes="(max-width: 640px) 160px, 190px"
        />
      ) : (
        <LogoMark />
      )}
    </Link>
  );
}
