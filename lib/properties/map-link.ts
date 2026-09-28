/**
 * §12 — the property's location, given as a Google Maps link.
 *
 * The wizard used to ask for latitude and longitude as two number fields, which
 * nobody outside surveying can answer. A seller standing on the plot can share
 * it from the Maps app in two taps, so that is what we accept, and the
 * coordinates are pulled out of the link here.
 *
 * Coordinates are still what gets stored. They are what a map embed, a distance
 * sort and the `geo` block in the listing's structured data all need, and they
 * keep working if the link shape changes or the link rots. The link is kept
 * alongside them as provenance — it is what the seller actually vouched for.
 */

export type MapPoint = {
  latitude: number;
  longitude: number;
};

/**
 * Hosts we will read a location out of.
 *
 * An allowlist rather than a "contains google" check: the value is rendered into
 * an iframe `src` and offered as a link, so a lookalike host is not something to
 * find out about later.
 */
const LONG_HOSTS = new Set([
  'google.com',
  'www.google.com',
  'maps.google.com',
  'www.maps.google.com',
  // Google serves country domains, and Indian sellers get .co.in constantly.
  'google.co.in',
  'www.google.co.in',
  'maps.google.co.in',
]);

/** Share links. These carry no coordinates until they are followed. */
const SHORT_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl', 'www.goo.gl']);

function hostOf(raw: string): { url: URL; host: string } | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;

  // Sellers paste bare hostnames as often as full URLs.
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return { url, host: url.hostname.toLowerCase() };
  } catch {
    return null;
  }
}

/** True for a share link, which has to be followed before it says anything. */
export function isShortMapUrl(raw: string | null | undefined): boolean {
  const parsed = hostOf(raw ?? '');
  return parsed ? SHORT_HOSTS.has(parsed.host) : false;
}

/** True for any Google Maps link we are willing to take, short or long. */
export function isMapUrl(raw: string | null | undefined): boolean {
  const parsed = hostOf(raw ?? '');
  if (!parsed) return false;
  return SHORT_HOSTS.has(parsed.host) || LONG_HOSTS.has(parsed.host);
}

function point(lat: number, lng: number): MapPoint | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  // 0,0 is in the Atlantic. It is what a failed parse looks like, never a plot.
  if (lat === 0 && lng === 0) return null;

  // Six decimals is about 11cm. Beyond that is noise, and it makes the stored
  // value stable when the same place is shared from two different screens.
  return {
    latitude: Number(lat.toFixed(6)),
    longitude: Number(lng.toFixed(6)),
  };
}

function fromPair(value: string | null): MapPoint | null {
  if (!value) return null;
  const match = value.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!match) return null;
  return point(Number(match[1]), Number(match[2]));
}

/**
 * Pulls coordinates out of a long Google Maps URL.
 *
 * Maps has accumulated a lot of URL shapes and a seller's link could be any of
 * them, so each is tried in order of how much it can be trusted:
 *
 *   ?q=LAT,LNG              an explicit request for a point
 *   ?query=LAT,LNG          the documented Maps URLs API form
 *   ?ll=LAT,LNG             older, still emitted by some share sheets
 *   !3dLAT!4dLNG            the place's own coordinates, inside the data blob
 *   /@LAT,LNG,17z           where the camera was pointing
 *
 * `@` is last on purpose. It is the viewport centre, not the place — on a link
 * copied after panning around it can be a street or two off. `!3d!4d` is the
 * pin itself, so it wins whenever both are present.
 */
export function parseMapUrl(raw: string | null | undefined): MapPoint | null {
  const parsed = hostOf(raw ?? '');
  if (!parsed || !LONG_HOSTS.has(parsed.host)) return null;

  const { url } = parsed;

  const explicit =
    fromPair(url.searchParams.get('q')) ??
    fromPair(url.searchParams.get('query')) ??
    fromPair(url.searchParams.get('ll')) ??
    fromPair(url.searchParams.get('center'));
  if (explicit) return explicit;

  const decoded = safeDecode(`${url.pathname}${url.search}`);

  const pin = decoded.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (pin) {
    const found = point(Number(pin[1]), Number(pin[2]));
    if (found) return found;
  }

  const camera = decoded.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (camera) {
    const found = point(Number(camera[1]), Number(camera[2]));
    if (found) return found;
  }

  return null;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    // A stray % makes decodeURIComponent throw; the raw string still parses.
    return value;
  }
}

/**
 * Resolves whatever the seller pasted into coordinates, following a share link
 * if that is what it is.
 *
 * Server-side only, because it makes a request. A share link contains no
 * coordinates at all — `maps.app.goo.gl/xxxx` is an opaque id — so the only way
 * to read one is to ask Google where it points. HEAD with redirects followed,
 * then the final URL goes through the same parser.
 *
 * Returns `{ point: null }` rather than throwing on anything unexpected. A
 * location that could not be read is a listing without a map, not a failed
 * save — the seller has already given a locality, city and PIN code.
 */
export async function resolveMapUrl(
  raw: string | null | undefined,
  { timeoutMs = 6000 }: { timeoutMs?: number } = {},
): Promise<{ point: MapPoint | null; resolvedUrl: string | null }> {
  if (!isMapUrl(raw)) return { point: null, resolvedUrl: null };

  const direct = parseMapUrl(raw);
  if (direct) return { point: direct, resolvedUrl: (raw ?? '').trim() };

  if (!isShortMapUrl(raw)) return { point: null, resolvedUrl: null };

  const target = /^https?:\/\//i.test((raw ?? '').trim())
    ? (raw ?? '').trim()
    : `https://${(raw ?? '').trim()}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(target, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      // Google serves a consent interstitial to unknown clients and the
      // redirect chain never resolves. A browser UA gets the real target.
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'accept-language': 'en-IN,en;q=0.9',
      },
    });

    const found = parseMapUrl(response.url);
    if (found) return { point: found, resolvedUrl: response.url };

    // Some share links land on a consent or interstitial page whose URL has no
    // coordinates, but the body carries the place's own !3d!4d.
    const body = await response.text();
    const pin = body.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
    if (pin) {
      const fromBody = point(Number(pin[1]), Number(pin[2]));
      if (fromBody) return { point: fromBody, resolvedUrl: response.url };
    }

    return { point: null, resolvedUrl: response.url };
  } catch {
    return { point: null, resolvedUrl: null };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The embed used on a public listing page.
 *
 * Deliberately coarse. The exact address is what the ₹9 unlock buys, and a pin
 * dropped on the plot would hand that over for nothing — so before an unlock the
 * map is centred on the locality by name, with no marker and a neighbourhood
 * zoom. It answers "which part of town" without answering "which gate".
 */
export function areaEmbedUrl(parts: {
  locality: string | null;
  city: string;
  state: string | null;
}): string {
  const place = [parts.locality, parts.city, parts.state, 'India'].filter(Boolean).join(', ');
  return `https://www.google.com/maps?q=${encodeURIComponent(place)}&z=13&output=embed`;
}

/** The exact pin, shown only once the address has been unlocked. */
export function pointEmbedUrl(pt: MapPoint): string {
  return `https://www.google.com/maps?q=${pt.latitude},${pt.longitude}&z=17&output=embed`;
}

/** "Open in Google Maps" — directions work from here, an embed cannot do them. */
export function mapsLinkFor(pt: MapPoint): string {
  return `https://www.google.com/maps/search/?api=1&query=${pt.latitude},${pt.longitude}`;
}
