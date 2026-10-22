/**
 * §13 — the image loader.
 *
 * Vercel's Image Optimization bills per transformation, and a property
 * marketplace is nothing but images: a search page is 24 cards, each at several
 * widths, and the quota went. Supabase Storage can resize the same objects
 * itself, at the origin that already holds them, so the transformations move
 * there and Vercel stops counting them.
 *
 * This replaces URL *generation* only. Next still picks the widths from
 * `deviceSizes`/`imageSizes`, still writes the `srcset`, still honours `sizes`,
 * `fill` and `priority`. Every layout is untouched — what changes is the host
 * that resizes the bytes.
 *
 * Two rules, and both matter:
 *
 *   1. Only `/storage/v1/object/public/` URLs are rewritten. A signed or
 *      private object (`/object/sign/`, `verification-docs`) is passed through
 *      untouched, because `render/image/public` cannot read a private object
 *      and rewriting one would turn a working signed URL into a 400. Nothing
 *      renders a private object through `next/image` today; this keeps that
 *      true if somebody tries.
 *   2. Everything else — the local logo assets, Google account avatars — goes
 *      to Next's own optimizer exactly as before. A `loaderFile` otherwise
 *      applies to every image on the site, and silently un-optimising the
 *      logo and the avatars is not a thing to do by accident. They are two
 *      static files and one small avatar per account; they were never the
 *      quota problem.
 */

/** Next's default when an `<Image>` does not set one. */
const DEFAULT_QUALITY = 75;

/**
 * Where the public objects live, e.g.
 * `https://<ref>.supabase.co/storage/v1/object/public/`.
 *
 * Read from the public env var rather than hardcoded, so a preview branch
 * pointed at another project keeps working. `NEXT_PUBLIC_` is required: this
 * module runs in the browser as well as on the server.
 */
const PUBLIC_OBJECT_PREFIX = (() => {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  try {
    return new URL('/storage/v1/object/public/', base).toString();
  } catch {
    return null;
  }
})();

export type ImageLoaderArgs = {
  src: string;
  width: number;
  quality?: number;
};

/**
 * Everything that is not a public Supabase object: served at its own URL.
 *
 * This deliberately does NOT hand the image to `/_next/image`, which was the
 * first attempt and is wrong on Vercel. Configuring `images.loader: 'custom'`
 * tells the build that Next will not use the optimizer, so Vercel does not
 * deploy that route at all and every such URL 404s. It works under a local
 * `next start`, where the route exists regardless — which is exactly how it
 * passed local verification and still broke the logo in production.
 *
 * So the remaining images have to be fine served as-is, and they are: the two
 * logo assets are sized for their use (see `public/logo*.webp`) and a Google
 * avatar arrives small already.
 */
function passThrough(src: string): string {
  return src;
}

export default function supabaseImageLoader({ src, width, quality }: ImageLoaderArgs): string {
  if (!PUBLIC_OBJECT_PREFIX || !src.startsWith(PUBLIC_OBJECT_PREFIX)) {
    return passThrough(src);
  }

  const objectPath = src.slice(PUBLIC_OBJECT_PREFIX.length);

  // Defensive: a prefix match with nothing after it is not an object.
  if (objectPath === '') return passThrough(src);

  /**
   * `resize=contain` is not optional.
   *
   * The default mode is `cover`, and with a width but no height it returns the
   * requested width at the *original* height — a 1086x1448 photo asked for 80px
   * comes back 80x1448. Distorted, and four times the bytes of the correct
   * answer. `contain` scales proportionally: 80x107 at 2.5 KB against 192 KB
   * for the original.
   *
   * No height is sent on purpose. Every `<Image>` here uses `fill` with CSS
   * `object-cover`/`object-contain` doing the cropping, so the transformation
   * only needs to supply the right number of pixels; the aspect ratio stays
   * whatever the photo is, and the layout is unchanged.
   *
   * Supabase clamps to the original rather than upscaling — a request for 1920
   * on a 1086-wide photo returns 1086 — so the large end costs nothing extra
   * and needs no guard here.
   */
  const params = new URLSearchParams({
    width: String(width),
    resize: 'contain',
    quality: String(quality ?? DEFAULT_QUALITY),
  });

  return `${PUBLIC_OBJECT_PREFIX.replace('/object/public/', '/render/image/public/')}${objectPath}?${params.toString()}`;
}
