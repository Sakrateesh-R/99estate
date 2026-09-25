/**
 * Generates illustrative listing photography and uploads it to Supabase
 * Storage, so the demo data exercises the real image pipeline.
 *
 * Why generate rather than download: stock photos carry licensing, and the
 * app's CSP/remote-image allow-list only permits the Supabase bucket. These
 * are deliberately stylised architectural renders — they read correctly at
 * card size without pretending to be photographs of a real building.
 *
 * PNG is encoded by hand (zlib is in the standard library) to keep the script
 * dependency-free.
 *
 *   node --env-file=.env.local scripts/seed-images.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { deflateSync } from 'node:zlib';
import { randomUUID } from 'node:crypto';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const db = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BUCKET = 'property-images';
const WIDTH = 1200;
const HEIGHT = 800;
const IMAGES_PER_LISTING = 4;

// ---------------------------------------------------------------------------
// Minimal PNG encoder (truecolour, 8-bit, no interlace)
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
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

/** `pixels` is RGB, 3 bytes per pixel, row-major. */
function encodePng(pixels, width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  // Each scanline is prefixed with its filter byte (0 = None).
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
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

// ---------------------------------------------------------------------------
// Scene generation
// ---------------------------------------------------------------------------

/** Deterministic PRNG so re-running produces identical images. */
function makeRandom(seed) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return () => {
    h ^= h << 13; h >>>= 0;
    h ^= h >> 17;
    h ^= h << 5; h >>>= 0;
    return h / 0xffffffff;
  };
}

function hslToRgb(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h * 12) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))));
  };
  return [f(0), f(8), f(4)];
}

const PALETTES = [
  { sky: 0.58, ground: 0.33 }, // cool blue dusk
  { sky: 0.08, ground: 0.09 }, // warm golden hour
  { sky: 0.45, ground: 0.38 }, // teal morning
  { sky: 0.72, ground: 0.66 }, // violet evening
];

/**
 * Draws a skyline: gradient sky, a haze band, staggered towers with lit
 * windows, and a ground plane. Enough structure to read as architecture at
 * 320px wide without looking like clip art.
 */
function renderScene(seed, variant) {
  const rand = makeRandom(`${seed}:${variant}`);
  const palette = PALETTES[variant % PALETTES.length];
  const pixels = Buffer.alloc(WIDTH * HEIGHT * 3);

  const horizon = Math.round(HEIGHT * (0.66 + rand() * 0.06));

  // --- sky: vertical gradient, lighter toward the horizon ---
  for (let y = 0; y < horizon; y++) {
    const t = y / horizon;
    const [r, g, b] = hslToRgb(
      palette.sky + t * 0.03,
      0.42 - t * 0.2,
      0.28 + t * 0.42,
    );
    for (let x = 0; x < WIDTH; x++) {
      const i = (y * WIDTH + x) * 3;
      pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b;
    }
  }

  // --- ground ---
  for (let y = horizon; y < HEIGHT; y++) {
    const t = (y - horizon) / (HEIGHT - horizon);
    const [r, g, b] = hslToRgb(palette.ground, 0.18, 0.30 - t * 0.14);
    for (let x = 0; x < WIDTH; x++) {
      const i = (y * WIDTH + x) * 3;
      pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b;
    }
  }

  const fillRect = (x0, y0, x1, y1, [r, g, b]) => {
    const xa = Math.max(0, Math.round(x0));
    const xb = Math.min(WIDTH, Math.round(x1));
    const ya = Math.max(0, Math.round(y0));
    const yb = Math.min(HEIGHT, Math.round(y1));
    for (let y = ya; y < yb; y++) {
      for (let x = xa; x < xb; x++) {
        const i = (y * WIDTH + x) * 3;
        pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b;
      }
    }
  };

  // --- towers, back layer to front so nearer blocks overlap ---
  const layers = [
    { count: 7, minH: 0.20, maxH: 0.40, light: 0.20, sat: 0.14 },
    { count: 5, minH: 0.32, maxH: 0.58, light: 0.15, sat: 0.16 },
  ];

  for (const layer of layers) {
    let x = -40 - rand() * 60;
    for (let n = 0; n < layer.count; n++) {
      const w = WIDTH * (0.10 + rand() * 0.12);
      const h = HEIGHT * (layer.minH + rand() * (layer.maxH - layer.minH));
      const top = horizon - h;
      const body = hslToRgb(palette.sky + 0.02, layer.sat, layer.light + rand() * 0.05);

      fillRect(x, top, x + w, horizon, body);

      // window grid
      const cols = Math.max(2, Math.floor(w / 34));
      const rows = Math.max(3, Math.floor(h / 40));
      const padX = w * 0.14;
      const padY = h * 0.08;
      const cellW = (w - padX * 2) / cols;
      const cellH = (h - padY * 2) / rows;

      for (let c = 0; c < cols; c++) {
        for (let r2 = 0; r2 < rows; r2++) {
          const lit = rand() > 0.42;
          const glow = lit
            ? hslToRgb(0.11, 0.62, 0.62 + rand() * 0.12)
            : hslToRgb(palette.sky, 0.10, layer.light + 0.06);
          const wx = x + padX + c * cellW;
          const wy = top + padY + r2 * cellH;
          fillRect(wx, wy, wx + cellW * 0.58, wy + cellH * 0.52, glow);
        }
      }

      x += w * (0.86 + rand() * 0.3);
      if (x > WIDTH) break;
    }
  }

  // --- horizon haze, so towers sit in the scene rather than on top of it ---
  for (let y = horizon - 26; y < horizon; y++) {
    if (y < 0) continue;
    const t = (y - (horizon - 26)) / 26;
    for (let x = 0; x < WIDTH; x++) {
      const i = (y * WIDTH + x) * 3;
      const [hr, hg, hb] = hslToRgb(palette.sky + 0.02, 0.3, 0.55);
      pixels[i] = Math.round(pixels[i] * (1 - t * 0.5) + hr * t * 0.5);
      pixels[i + 1] = Math.round(pixels[i + 1] * (1 - t * 0.5) + hg * t * 0.5);
      pixels[i + 2] = Math.round(pixels[i + 2] * (1 - t * 0.5) + hb * t * 0.5);
    }
  }

  return encodePng(pixels, WIDTH, HEIGHT);
}

// ---------------------------------------------------------------------------
async function main() {
  console.log(`\nGenerating listing imagery for ${url}\n`);

  const { data: properties, error } = await db
    .from('properties')
    .select('id, title, cover_image_url')
    .order('created_at');

  if (error) throw new Error(error.message);
  if (!properties?.length) throw new Error('No properties found — run db:seed:remote first.');

  for (const [index, property] of properties.entries()) {
    const { count } = await db
      .from('property_images')
      .select('id', { count: 'exact', head: true })
      .eq('property_id', property.id);

    if ((count ?? 0) > 0) {
      console.log(`  skipping "${property.title.slice(0, 40)}…" (${count} images already)`);
      continue;
    }

    for (let variant = 0; variant < IMAGES_PER_LISTING; variant++) {
      const png = renderScene(property.id, variant + index);
      const path = `properties/${property.id}/${randomUUID()}.png`;

      const { error: uploadError } = await db.storage
        .from(BUCKET)
        .upload(path, png, { contentType: 'image/png', upsert: false });
      if (uploadError) throw new Error(`upload: ${uploadError.message}`);

      const {
        data: { publicUrl },
      } = db.storage.from(BUCKET).getPublicUrl(path);

      const { error: rowError } = await db.from('property_images').insert({
        property_id: property.id,
        storage_path: path,
        public_url: publicUrl,
        sort_order: variant,
        width: WIDTH,
        height: HEIGHT,
        byte_size: png.length,
      });
      if (rowError) throw new Error(`manifest row: ${rowError.message}`);
    }

    console.log(`  ${IMAGES_PER_LISTING} images -> "${property.title.slice(0, 40)}…"`);
  }

  const { count: total } = await db
    .from('property_images')
    .select('id', { count: 'exact', head: true });
  const { count: covered } = await db
    .from('properties')
    .select('id', { count: 'exact', head: true })
    .not('cover_image_url', 'is', null);

  console.log(`\nDone. ${total} images across ${covered} listings with covers set.\n`);
}

main().catch((error) => {
  console.error(`\nImage seeding failed: ${error.message}\n`);
  process.exit(1);
});
