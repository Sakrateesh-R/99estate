/**
 * §12 — the video tour link.
 *
 * A seller pastes a YouTube or Vimeo URL and we store a canonical form of it.
 * Nothing is uploaded, transcoded or served by us: the host does the encoding,
 * the adaptive streaming and the bandwidth, for free and at any scale.
 *
 * Two rules make that safe to render:
 *
 *   1. Only YouTube and Vimeo are accepted. The stored value ends up inside an
 *      `<iframe src>`, so an open field would let a seller frame anything they
 *      liked on a page that carries our name — a fake payment form included.
 *   2. What is stored is rebuilt from a parsed video id rather than kept as
 *      typed. A URL that survived a substring check could still carry
 *      `?redirect=` or a second host later in the string; an id cannot.
 *
 * The database repeats rule 1 as a CHECK constraint against the exact shapes
 * below, so a write that bypasses this module still cannot store an arbitrary
 * URL.
 */

export type VideoProvider = 'youtube' | 'vimeo';

export type ParsedVideo = {
  provider: VideoProvider;
  id: string;
  /** What gets stored, and what a buyer sees if they open it directly. */
  canonicalUrl: string;
  /** What goes in the iframe. */
  embedUrl: string;
};

/** 11 characters, the fixed width of a YouTube id. */
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^[0-9]{6,12}$/;

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'youtu.be',
]);

const VIMEO_HOSTS = new Set(['vimeo.com', 'www.vimeo.com', 'player.vimeo.com']);

function build(provider: VideoProvider, id: string): ParsedVideo {
  return provider === 'youtube'
    ? {
        provider,
        id,
        canonicalUrl: `https://www.youtube.com/watch?v=${id}`,
        /**
         * `youtube-nocookie.com` rather than `youtube.com`: the ordinary embed
         * sets tracking cookies before anybody presses play, which would make a
         * buyer merely opening a listing a disclosure to Google.
         */
        embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1`,
      }
    : {
        provider,
        id,
        canonicalUrl: `https://vimeo.com/${id}`,
        embedUrl: `https://player.vimeo.com/video/${id}?dnt=1`,
      };
}

/**
 * Parses whatever a seller pasted. Returns null for anything unrecognised,
 * rather than guessing — a link we cannot read is a link we should not frame.
 */
export function parseVideoUrl(raw: string | null | undefined): ParsedVideo | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;

  // Bare ids are what people paste surprisingly often.
  if (YOUTUBE_ID.test(trimmed)) return build('youtube', trimmed);

  let url: URL;
  try {
    // Tolerate a missing scheme; people copy "youtu.be/..." out of WhatsApp.
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split('/').filter(Boolean);

  if (YOUTUBE_HOSTS.has(host)) {
    // youtu.be/<id>
    if (host === 'youtu.be') {
      const id = segments[0];
      return id && YOUTUBE_ID.test(id) ? build('youtube', id) : null;
    }

    // youtube.com/watch?v=<id>
    const queryId = url.searchParams.get('v');
    if (queryId && YOUTUBE_ID.test(queryId)) return build('youtube', queryId);

    // youtube.com/{embed,shorts,live,v}/<id>
    if (segments.length >= 2 && ['embed', 'shorts', 'live', 'v'].includes(segments[0]!)) {
      const id = segments[1]!;
      return YOUTUBE_ID.test(id) ? build('youtube', id) : null;
    }

    return null;
  }

  if (VIMEO_HOSTS.has(host)) {
    // vimeo.com/<id> and player.vimeo.com/video/<id>
    const id = host === 'player.vimeo.com' ? segments[1] : segments[0];
    return id && VIMEO_ID.test(id) ? build('vimeo', id) : null;
  }

  return null;
}

/** Human-readable provider name, for labels and the "opens on" note. */
export const VIDEO_PROVIDER_LABELS: Record<VideoProvider, string> = {
  youtube: 'YouTube',
  vimeo: 'Vimeo',
};
