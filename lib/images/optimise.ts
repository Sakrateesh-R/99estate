/**
 * Browser-side photo downscaling, shared by every uploader (§13).
 *
 * Extracted from the property uploader when projects needed the same thing. It
 * is deliberately shared rather than copied: this is the code path that already
 * cost us "one photo in ten stored uncompressed", the reasons for each fallback
 * below are not obvious, and a second copy would be the one that goes stale.
 *
 * Phone cameras produce 4–12 MB JPEGs; nothing on this site displays an image
 * wider than ~1900px. Doing this in the browser saves the uploader's data, keeps
 * files inside the 10 MB bucket limit, and means the CDN serves a sane file.
 */

const MAX_EDGE = 1920;
const WEBP_QUALITY = 0.82;

export type Optimised = {
  blob: Blob;
  width: number;
  height: number;
  ext: string;
  /** Set only when the original is being passed through untouched. */
  failure?: { reason: string; detail?: string };
};

/**
 * Edges to try, largest first.
 *
 * `canvas.toBlob` returns null rather than throwing when it cannot produce the
 * image — most often because the canvas is too large for the device. Dropping
 * the target and trying again costs a few milliseconds and rescues exactly that
 * case, which giving up on the first attempt never could.
 */
const EDGE_ATTEMPTS = [MAX_EDGE, 1280, 1024];

/** WebP first; JPEG exists for browsers whose canvas will not encode WebP. */
const ENCODINGS = [
  { type: 'image/webp', ext: 'webp' },
  { type: 'image/jpeg', ext: 'jpg' },
] as const;

function encode(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, WEBP_QUALITY));
}

/**
 * Shrinks and re-encodes a photo in the browser, before it is uploaded.
 *
 * Passing the original through is still the last resort — somebody holding a
 * perfectly good photo must never be blocked because we could not compress it —
 * but it is genuinely last, and it reports why. An earlier version returned the
 * original on any failure without a word, which is how roughly one stored photo
 * in ten ended up uncompressed with nothing to explain it.
 */
export async function optimiseImage(file: File): Promise<Optimised> {
  const passThrough = (reason: string, detail?: string): Optimised => ({
    blob: file,
    width: 0,
    height: 0,
    ext: file.name.split('.').pop()?.toLowerCase() ?? 'jpg',
    failure: { reason, detail },
  });

  if (typeof createImageBitmap !== 'function') {
    return passThrough('no-createimagebitmap');
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (cause) {
    // The likeliest real cause: a format this browser cannot decode, such as
    // HEIC from an iPhone arriving with a .jpg name.
    return passThrough('decode-failed', cause instanceof Error ? cause.message : String(cause));
  }

  try {
    for (const edge of EDGE_ATTEMPTS) {
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
      const width = Math.round(bitmap.width * scale);
      const height = Math.round(bitmap.height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) return passThrough('no-canvas-context');
      ctx.drawImage(bitmap, 0, 0, width, height);

      for (const { type, ext } of ENCODINGS) {
        const blob = await encode(canvas, type);
        // Some browsers ignore an unsupported type and silently hand back PNG,
        // which is larger than the original and worse than not bothering.
        if (blob && blob.type === type) return { blob, width, height, ext };
      }
    }

    return passThrough('encode-failed', `${bitmap.width}x${bitmap.height}`);
  } finally {
    bitmap.close();
  }
}
