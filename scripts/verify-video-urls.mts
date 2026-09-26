/**
 * The allowlist behind `properties.video_url` (§12).
 *
 * Part of `npm run check` rather than an occasional script: this parser is the
 * only thing standing between a pasted string and an `<iframe src>` on a page
 * carrying our name, and a guard nobody runs is a guard that rots. Runs in
 * about a second.
 *
 *   npm run verify:video
 */
import { parseVideoUrl } from '../lib/properties/video.ts';

let pass = 0;
const failures: string[] = [];

function accepts(input: string, expectedCanonical: string) {
  const got = parseVideoUrl(input);
  if (got?.canonicalUrl === expectedCanonical) pass++;
  else failures.push(`ACCEPT ${input}\n     want ${expectedCanonical}\n     got  ${got?.canonicalUrl ?? 'null'}`);
}

function rejects(input: string) {
  const got = parseVideoUrl(input);
  if (got === null) pass++;
  else failures.push(`REJECT ${input}\n     but got ${got.canonicalUrl} (embed ${got.embedUrl})`);
}

const YT = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

// --- Shapes people actually paste -------------------------------------------
accepts('https://www.youtube.com/watch?v=dQw4w9WgXcQ', YT);
accepts('http://youtube.com/watch?v=dQw4w9WgXcQ', YT);
accepts('https://youtu.be/dQw4w9WgXcQ', YT);
accepts('youtu.be/dQw4w9WgXcQ', YT);
accepts('  https://youtu.be/dQw4w9WgXcQ  ', YT);
accepts('https://m.youtube.com/watch?v=dQw4w9WgXcQ', YT);
accepts('https://www.youtube.com/shorts/dQw4w9WgXcQ', YT);
accepts('https://www.youtube.com/embed/dQw4w9WgXcQ', YT);
accepts('https://www.youtube.com/live/dQw4w9WgXcQ', YT);
accepts('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', YT);
// Extra params (timestamp, playlist, tracking) must be dropped, not carried.
accepts('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=PLabc', YT);
accepts('https://youtu.be/dQw4w9WgXcQ?si=trackingtoken', YT);
accepts('dQw4w9WgXcQ', YT);
accepts('https://vimeo.com/123456789', 'https://vimeo.com/123456789');
accepts('https://player.vimeo.com/video/123456789', 'https://vimeo.com/123456789');
accepts('vimeo.com/123456789', 'https://vimeo.com/123456789');

// --- Hostile and malformed input --------------------------------------------
rejects('');
rejects('   ');
rejects('https://evil.com/video');
rejects('https://evil.com/watch?v=dQw4w9WgXcQ');
// Look-alike hosts: the check must be the whole hostname, not a suffix or a
// substring of it.
rejects('https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ');
rejects('https://notyoutube.com/watch?v=dQw4w9WgXcQ');
rejects('https://myyoutube.com/watch?v=dQw4w9WgXcQ');
rejects('https://vimeo.com.evil.com/123456789');
// Credentials in the authority: the host is evil.com, not youtube.com.
rejects('https://www.youtube.com@evil.com/watch?v=dQw4w9WgXcQ');
// Non-http schemes must never reach an iframe src.
rejects('javascript:alert(1)');
rejects('javascript:alert(1)//youtube.com/watch?v=dQw4w9WgXcQ');
rejects('data:text/html,<script>alert(1)</script>');
rejects('file:///etc/passwd');
// Right host, no usable video id.
rejects('https://www.youtube.com');
rejects('https://www.youtube.com/watch?v=tooshort');
rejects('https://www.youtube.com/watch?v=this_id_is_way_too_long');
rejects('https://www.youtube.com/watch?v=bad!chars#');
rejects('https://www.youtube.com/channel/UCabcdefghijk');
rejects('https://www.youtube.com/@somecreator');
rejects('https://vimeo.com/abcdef');
rejects('https://vimeo.com/12');
rejects('https://vimeo.com/channels/staffpicks');

// The embed URL must always be a host we chose, never one from the input.
for (const input of [YT, 'https://vimeo.com/123456789']) {
  const parsed = parseVideoUrl(input)!;
  const host = new URL(parsed.embedUrl).hostname;
  if (host === 'www.youtube-nocookie.com' || host === 'player.vimeo.com') pass++;
  else failures.push(`EMBED HOST ${input} -> ${host}`);
}

console.log(`${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  FAIL ${f}`);
  process.exit(1);
}
console.log('Video URL allowlist holds.');
