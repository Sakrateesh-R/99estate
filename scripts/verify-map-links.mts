/**
 * The Google Maps link parser, against the shapes sellers actually paste.
 *
 * Same reasoning as verify-video-urls: this is pure string work with a lot of
 * cases, which is exactly what a table of examples is for. Every URL here is a
 * real Maps URL shape, not an invention.
 *
 *   node scripts/verify-map-links.mts
 *
 * Nothing here touches the network. `resolveMapUrl` does, and is covered by the
 * page checks instead.
 */
import { parseMapUrl, isMapUrl, isShortMapUrl, areaEmbedUrl, pointEmbedUrl } from '../lib/properties/map-link.ts';

let passed = 0;
const failures: string[] = [];

function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
  } else {
    failures.push(`${label}\n      expected ${e}\n      actual   ${a}`);
  }
}

// A plot in Coimbatore, used throughout so the expected numbers are obvious.
const LAT = 11.016844;
const LNG = 76.955832;
const AT = { latitude: LAT, longitude: LNG };

const PARSES: [string, string, typeof AT | null][] = [
  // --- the share sheet's "copy link" on desktop -----------------------------
  [
    'place URL with pin data',
    `https://www.google.com/maps/place/Theethipalayam/@11.0,76.9,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d${LAT}!4d${LNG}!16s%2Fg%2F11abc`,
    AT,
  ],
  ['viewport only', `https://www.google.com/maps/@${LAT},${LNG},17z`, AT],
  ['place with viewport only', `https://www.google.com/maps/place/Some+Plot/@${LAT},${LNG},18.5z`, AT],

  // --- explicit point requests ---------------------------------------------
  ['?q= pair', `https://www.google.com/maps?q=${LAT},${LNG}`, AT],
  ['?q= pair with spaces', `https://www.google.com/maps?q=${LAT},+${LNG}`, AT],
  ['Maps URLs API ?query=', `https://www.google.com/maps/search/?api=1&query=${LAT},${LNG}`, AT],
  ['legacy ?ll=', `https://maps.google.com/?ll=${LAT},${LNG}&z=16`, AT],

  // --- country domains -----------------------------------------------------
  ['google.co.in', `https://www.google.co.in/maps/@${LAT},${LNG},17z`, AT],
  ['maps.google.co.in', `https://maps.google.co.in/?q=${LAT},${LNG}`, AT],

  // --- pasted without a scheme, which sellers do constantly ----------------
  ['no scheme', `www.google.com/maps?q=${LAT},${LNG}`, AT],
  ['leading and trailing spaces', `   https://www.google.com/maps?q=${LAT},${LNG}   `, AT],

  // --- the pin wins over the camera ----------------------------------------
  [
    'pin data preferred over viewport',
    `https://www.google.com/maps/place/X/@11.1,77.1,17z/data=!4m6!3m5!8m2!3d${LAT}!4d${LNG}`,
    AT,
  ],

  // --- southern and western hemispheres ------------------------------------
  ['negative coordinates', 'https://www.google.com/maps?q=-33.8688,-151.2093', { latitude: -33.8688, longitude: -151.2093 }],

  // --- rounded to six decimals ---------------------------------------------
  ['over-precise input is rounded', 'https://www.google.com/maps?q=11.0168441234567,76.9558321234567', AT],

  // --- things that carry no location ---------------------------------------
  ['short link has no coordinates in it', 'https://maps.app.goo.gl/abc123XYZ', null],
  ['search by name only', 'https://www.google.com/maps/search/plots+in+coimbatore', null],
  ['0,0 is not a place', 'https://www.google.com/maps?q=0,0', null],
  ['latitude out of range', 'https://www.google.com/maps?q=91.5,76.9', null],
  ['longitude out of range', 'https://www.google.com/maps?q=11.0,181.2', null],

  // --- not Google Maps at all ----------------------------------------------
  ['apple maps', 'https://maps.apple.com/?ll=11.0168,76.9558', null],
  ['openstreetmap', 'https://www.openstreetmap.org/#map=17/11.0168/76.9558', null],
  ['lookalike host', `https://google.com.evil.example/maps?q=${LAT},${LNG}`, null],
  ['subdomain lookalike', `https://maps.google.com.attacker.net/?q=${LAT},${LNG}`, null],
  ['javascript scheme', 'javascript:alert(1)', null],
  ['empty', '', null],
  ['nonsense', 'not a url at all', null],
];

for (const [label, url, expected] of PARSES) {
  check(`parseMapUrl — ${label}`, parseMapUrl(url), expected);
}

// --- isMapUrl / isShortMapUrl ----------------------------------------------
const ACCEPTED: [string, boolean, boolean][] = [
  // url, isMapUrl, isShortMapUrl
  ['https://maps.app.goo.gl/abc123', true, true],
  ['https://goo.gl/maps/abc123', true, true],
  ['maps.app.goo.gl/abc123', true, true],
  [`https://www.google.com/maps?q=${LAT},${LNG}`, true, false],
  ['https://www.google.co.in/maps/place/X', true, false],
  ['https://maps.apple.com/?ll=1,2', false, false],
  ['https://bit.ly/abc', false, false],
  ['', false, false],
];

for (const [url, wantMap, wantShort] of ACCEPTED) {
  check(`isMapUrl — ${url || '(empty)'}`, isMapUrl(url), wantMap);
  check(`isShortMapUrl — ${url || '(empty)'}`, isShortMapUrl(url), wantShort);
}

// --- embeds ----------------------------------------------------------------
// The public embed must never contain the coordinates: that is the whole point.
const area = areaEmbedUrl({ locality: 'Theethipalayam', city: 'Coimbatore', state: 'Tamil Nadu' });
check('area embed carries no latitude', area.includes(String(LAT)), false);
check('area embed carries no longitude', area.includes(String(LNG)), false);
check('area embed names the locality', area.includes('Theethipalayam'), true);
check('area embed is a keyless embed', area.includes('output=embed'), true);
check('area embed zooms out to the neighbourhood', area.includes('z=13'), true);

const areaNoLocality = areaEmbedUrl({ locality: null, city: 'Coimbatore', state: null });
check('area embed survives a missing locality', areaNoLocality.includes('Coimbatore%2C+India') || areaNoLocality.includes('Coimbatore,India') || areaNoLocality.includes('Coimbatore%2C%20India'), true);

const pin = pointEmbedUrl(AT);
check('point embed carries the coordinates', pin.includes(`${LAT},${LNG}`), true);
check('point embed zooms in', pin.includes('z=17'), true);

console.log(`${failures.length === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failures.length} failed`);
failures.forEach((f) => console.log(`  FAIL  ${f}`));
if (failures.length === 0) console.log('Google Maps link parsing holds.');
process.exit(failures.length === 0 ? 0 : 1);
