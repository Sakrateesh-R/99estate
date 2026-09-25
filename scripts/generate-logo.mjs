/**
 * Writes `public/logo.png` — the raster logo referenced by the Organization
 * structured data.
 *
 * `app/icon.svg` already exists and serves the favicon, but Google does not
 * accept SVG for an Organization logo, so the knowledge-panel mark has to be
 * a raster. Generating it keeps the two in sync: same geometry, same brand
 * colours, one place to change.
 *
 * PNG is encoded by hand because zlib is in the standard library and this is
 * the only thing in the project that needs to write an image — a dependency
 * would cost more than the forty lines below.
 *
 *   node scripts/generate-logo.mjs
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const SIZE = 512;
const OUT = resolve(process.cwd(), 'public/logo.png');

// Straight from app/globals.css.
const BRAND_700 = [0x0c, 0x68, 0x52];
const BRAND_300 = [0x78, 0xd9, 0xb5];
const BRAND_900 = [0x0c, 0x45, 0x38];

// --- PNG encoding -----------------------------------------------------------

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

function encodePng(pixels, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // no filter
  ihdr[12] = 0; // no interlace

  // One filter byte per scanline, filter type 0.
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Geometry ---------------------------------------------------------------

const s = (n) => (n / 32) * SIZE; // the SVG is authored on a 32px grid

/** Rounded square, matching the favicon's rx="9" on a 32 grid. */
function inRoundedSquare(x, y) {
  const r = s(9);
  const near = (cx, cy) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
  if (x >= r && x <= SIZE - r) return y >= 0 && y <= SIZE;
  if (y >= r && y <= SIZE - r) return x >= 0 && x <= SIZE;
  return (
    near(r, r) || near(SIZE - r, r) || near(r, SIZE - r) || near(SIZE - r, SIZE - r)
  );
}

function inTriangle(x, y, [ax, ay], [bx, by], [cx, cy]) {
  const sign = (px, py, qx, qy, rx, ry) => (px - rx) * (qy - ry) - (qx - rx) * (py - ry);
  const d1 = sign(x, y, ax, ay, bx, by);
  const d2 = sign(x, y, bx, by, cx, cy);
  const d3 = sign(x, y, cx, cy, ax, ay);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

/**
 * Supersampled 3×3 so the roof diagonal and the corner radius come out smooth
 * — at 512px a hard-edged diagonal is very visible.
 */
function colourAt(x, y) {
  if (!inRoundedSquare(x, y)) return null;

  const roof = inTriangle(x, y, [s(16), s(7.4)], [s(25.6), s(16.6)], [s(6.4), s(16.6)]);
  const body = inRect(x, y, s(9.1), s(16.6), s(22.9), s(24.4));
  const door = inRect(x, y, s(13.7), s(19.6), s(18.3), s(24.4));

  if (door) return BRAND_900;
  if (roof || body) return BRAND_300;
  return BRAND_700;
}

const pixels = Buffer.alloc(SIZE * SIZE * 4);

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    let samples = 0;

    for (let sy = 0; sy < 3; sy++) {
      for (let sx = 0; sx < 3; sx++) {
        const c = colourAt(x + (sx + 0.5) / 3, y + (sy + 0.5) / 3);
        samples++;
        if (c) {
          r += c[0];
          g += c[1];
          b += c[2];
          a += 255;
        }
      }
    }

    const i = (y * SIZE + x) * 4;
    const covered = a / 255;
    // Average over covered samples only, so edge pixels keep the shape's
    // colour and fade in alpha rather than darkening towards black.
    pixels[i] = covered ? Math.round(r / covered) : 0;
    pixels[i + 1] = covered ? Math.round(g / covered) : 0;
    pixels[i + 2] = covered ? Math.round(b / covered) : 0;
    pixels[i + 3] = Math.round(a / samples);
  }
}

mkdirSync(dirname(OUT), { recursive: true });
const png = encodePng(pixels, SIZE);
writeFileSync(OUT, png);

console.log(`Wrote ${OUT} — ${SIZE}×${SIZE}, ${(png.length / 1024).toFixed(1)} kB`);
