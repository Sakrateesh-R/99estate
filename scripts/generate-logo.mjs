/**
 * Derives the site's logo assets from one supplied master image.
 *
 * The brand artwork is a wide lockup — the 99 mark, the Estate.in wordmark and
 * a BUY | SELL | RENT | EXPLORE strapline — with a great deal of transparent
 * margin around it. Three files come out:
 *
 *   public/logo.png       the lockup, trimmed to its artwork. The header, the
 *                         auth screens, and the Organization logo in the
 *                         structured data — Google will not take an SVG there.
 *   app/icon.png          the 99 mark alone, squared and downscaled to 192px.
 *                         The full lockup is illegible as a favicon, and Next
 *                         serves this file byte-for-byte rather than optimising
 *                         it, so its size on disk is what visitors download.
 *   public/logo-mark.png  the same square at full resolution, for the footer.
 *                         `app/icon.png` is a file convention and is not
 *                         addressable as an ordinary image.
 *
 * All three are cut from the master rather than drawn, so the favicon and the
 * header cannot drift apart the way a hand-copied SVG of the mark would.
 *
 * PNG is decoded and encoded by hand. The project has no image dependency and
 * does not need one for a crop: zlib is in the standard library, and `sharp`
 * would be a large native dependency to install and keep current for a script
 * that runs when the logo changes.
 *
 *   node scripts/generate-logo.mjs [path-to-master.png]
 *
 * Defaults to `public/logo.png`, so it is idempotent — re-running trims an
 * already-trimmed file to the same bounds and rewrites the same icon.
 */

import { deflateSync, inflateSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const MASTER = resolve(ROOT, process.argv[2] ?? 'public/logo.png');
const LOGO_OUT = resolve(ROOT, 'public/logo.png');
const ICON_OUT = resolve(ROOT, 'app/icon.png');
const MARK_OUT = resolve(ROOT, 'public/logo-mark.png');

/** A pixel counts as artwork above this alpha; below it is anti-aliasing fringe. */
const ALPHA_FLOOR = 8;

/**
 * Where the 99 mark ends and the wordmark begins, as a fraction of the trimmed
 * width.
 *
 * Measured from the master rather than guessed: a column-density profile of
 * strongly opaque, non-pale pixels has a clear trough at 31% — the gap between
 * the second 9 and the E. It is a fraction rather than a pixel count so that
 * re-supplying the artwork at a different resolution still cuts in the right
 * place.
 */
const MARK_END_FRACTION = 0.315;

// --- PNG ---------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

const paeth = (a, b, c) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** Decodes a non-interlaced 8-bit RGBA PNG to flat pixels. */
function decodePng(buf) {
  let pos = 8;
  let width = 0;
  let height = 0;
  const idat = [];

  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) {
        throw new Error(
          `master must be 8-bit RGBA, non-interlaced (got depth ${data[8]}, colour type ${data[9]}, interlace ${data[12]})`,
        );
      }
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }

    pos += 12 + len;
  }

  const bpp = 4;
  const stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(height * stride);

  // Undo the per-scanline filters. Each line names its own filter in its first
  // byte and refers to the line above, so this cannot be done out of order.
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));

    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? pixels[y * stride + x - bpp] : 0;
      const b = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? pixels[(y - 1) * stride + x - bpp] : 0;

      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) v += paeth(a, b, c);

      pixels[y * stride + x] = v & 0xff;
    }
  }

  return { width, height, pixels };
}

function encodePng(pixels, width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // no filter
  ihdr[12] = 0; // no interlace

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    // Filter type 1 (Sub) rather than 0: flat colour runs sideways across this
    // artwork, so predicting from the pixel to the left compresses it far
    // better than storing it raw.
    raw[y * (stride + 1)] = 1;
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? pixels[y * stride + x - 4] : 0;
      raw[y * (stride + 1) + 1 + x] = (pixels[y * stride + x] - left) & 0xff;
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Geometry ----------------------------------------------------------------

/** Tight box around everything that is not transparent. */
function artworkBounds({ width, height, pixels }) {
  const stride = width * 4;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[y * stride + x * 4 + 3] <= ALPHA_FLOOR) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0) throw new Error('master is fully transparent');
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * Box-filter downscale.
 *
 * The favicon has to be small in bytes, not just in CSS pixels: Next serves
 * `app/icon.png` byte-for-byte rather than putting it through the image
 * optimiser, so a 574px master would have every visitor downloading 216 KB to
 * draw a 32px square.
 *
 * Alpha is premultiplied before averaging and divided out afterwards. Without
 * that, a transparent pixel's colour — often black — is averaged in at full
 * weight and the artwork picks up a dark fringe everywhere it meets the
 * background, which on this logo would outline all of the white rooflines.
 */
function downscale(source, size) {
  const out = Buffer.alloc(size * size * 4);
  const srcStride = source.width * 4;
  const scaleX = source.width / size;
  const scaleY = source.height / size;

  for (let y = 0; y < size; y++) {
    const y0 = Math.floor(y * scaleY);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * scaleY));

    for (let x = 0; x < size; x++) {
      const x0 = Math.floor(x * scaleX);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * scaleX));

      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;

      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = sy * srcStride + sx * 4;
          const alpha = source.pixels[i + 3];
          r += source.pixels[i] * alpha;
          g += source.pixels[i + 1] * alpha;
          b += source.pixels[i + 2] * alpha;
          a += alpha;
          n++;
        }
      }

      const o = (y * size + x) * 4;
      if (a === 0) continue; // leave fully transparent
      out[o] = Math.round(r / a);
      out[o + 1] = Math.round(g / a);
      out[o + 2] = Math.round(b / a);
      out[o + 3] = Math.round(a / n);
    }
  }

  return { width: size, height: size, pixels: out };
}

/** Copies a rectangle into a new transparent canvas. */
function crop(source, box, canvas = { width: box.width, height: box.height, offsetX: 0, offsetY: 0 }) {
  const out = Buffer.alloc(canvas.width * canvas.height * 4); // transparent
  const srcStride = source.width * 4;
  const dstStride = canvas.width * 4;

  for (let y = 0; y < box.height; y++) {
    const dstY = y + canvas.offsetY;
    if (dstY < 0 || dstY >= canvas.height) continue;

    const srcStart = (box.y + y) * srcStride + box.x * 4;
    const dstStart = dstY * dstStride + canvas.offsetX * 4;
    source.pixels.copy(out, dstStart, srcStart, srcStart + box.width * 4);
  }

  return { width: canvas.width, height: canvas.height, pixels: out };
}

// --- Run ---------------------------------------------------------------------

const master = decodePng(readFileSync(MASTER));
const bounds = artworkBounds(master);

console.log(`master  ${master.width}x${master.height}`);
console.log(`artwork ${bounds.width}x${bounds.height} at (${bounds.x}, ${bounds.y})`);

// 1 · The trimmed lockup.
const lockup = crop(master, bounds);
mkdirSync(dirname(LOGO_OUT), { recursive: true });
writeFileSync(LOGO_OUT, encodePng(lockup.pixels, lockup.width, lockup.height));
console.log(`logo.png ${lockup.width}x${lockup.height}`);

// 2 · The 99 mark, centred in a square so the favicon is not lopsided.
const markWidth = Math.round(bounds.width * MARK_END_FRACTION);
const side = Math.max(markWidth, bounds.height);
const markBox = { x: bounds.x, y: bounds.y, width: markWidth, height: bounds.height };
const icon = crop(master, markBox, {
  width: side,
  height: side,
  offsetX: Math.round((side - markWidth) / 2),
  offsetY: Math.round((side - bounds.height) / 2),
});

/**
 * 192px, which is the largest size anything actually asks for — Android's
 * home-screen icon. Browsers scale it down to 32 or 16 for the tab.
 */
const small = downscale(icon, 192);
const iconPng = encodePng(small.pixels, small.width, small.height);

mkdirSync(dirname(ICON_OUT), { recursive: true });
writeFileSync(ICON_OUT, iconPng);
console.log(`icon.png ${small.width}x${small.height} (${Math.round(iconPng.length / 1024)} KB)`);

/**
 * The same square, in `public/`.
 *
 * `app/icon.png` is a Next file convention: it becomes the favicon and is not
 * addressable as `/icon.png`, so anything that wants the mark as an ordinary
 * image — the footer, for one — needs its own copy. Written from the same
 * bytes so the two cannot diverge.
 */
mkdirSync(dirname(MARK_OUT), { recursive: true });
writeFileSync(MARK_OUT, encodePng(icon.pixels, icon.width, icon.height));
console.log(`logo-mark.png ${icon.width}x${icon.height} (full size — next/image resizes it)`);
