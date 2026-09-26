import { Play } from 'lucide-react';
import { parseVideoUrl, VIDEO_PROVIDER_LABELS } from '@/lib/properties/video';

/**
 * §12 — the video tour on a listing page.
 *
 * `loading="lazy"` is doing real work: an eager iframe would have the buyer's
 * browser talking to YouTube on every listing open, whether or not they ever
 * scroll this far or press play. Combined with the `nocookie` host and Vimeo's
 * `dnt=1`, watching is a thing the buyer chooses rather than a thing that
 * happens to them.
 *
 * Parsed again here rather than trusted. The value comes from a column with a
 * CHECK constraint on it, so this cannot fail in practice — but "cannot fail in
 * practice" is a poor reason to interpolate a database string into an iframe
 * source, and re-parsing costs nothing.
 */
export function PropertyVideo({ videoUrl }: { videoUrl: string | null }) {
  const video = parseVideoUrl(videoUrl);
  if (!video) return null;

  return (
    <section className="mt-6 rounded-card border border-ink-200 bg-white p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <Play className="size-4 text-brand-600" aria-hidden />
        Video tour
      </h2>

      <div className="mt-4 aspect-video overflow-hidden rounded-field bg-ink-950">
        <iframe
          src={video.embedUrl}
          title="Property video tour"
          className="size-full"
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>

      <p className="mt-2.5 text-xs text-ink-500">
        {/*
          Said out loud because pressing play sends data to a third party, and a
          buyer is entitled to know that before they do.
        */}
        Hosted on {VIDEO_PROVIDER_LABELS[video.provider]}, not on 99Estate. Playing it shares your
        viewing with them.
      </p>
    </section>
  );
}
