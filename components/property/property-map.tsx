import { ExternalLink, MapPin } from 'lucide-react';
import { areaEmbedUrl, mapsLinkFor, pointEmbedUrl } from '@/lib/properties/map-link';

/**
 * §8 — the map at the bottom of a listing.
 *
 * Two maps, not one, and which you get is the same line the rest of the page
 * draws. The exact address is what the ₹9 unlock buys, so a pin dropped on the
 * plot would hand it over for free — anyone could read the page, read the pin
 * and never pay. Before an unlock the map is centred on the locality by name at
 * a neighbourhood zoom with no marker: enough to answer "which part of town",
 * not "which gate".
 *
 * After an unlock it is the real pin, plus a link out to Maps for directions,
 * which an embed cannot do.
 *
 * The iframe `src` is always built here from our own values — never from the
 * URL the seller pasted. That link is kept as provenance and nothing else, so
 * no listing can put arbitrary content in a frame on a page carrying our name.
 *
 * Keyless embed, so there is no Google API key to hold, rotate or bill. If one
 * is ever added, only these two URL builders change.
 */
export function PropertyMap({
  point,
  hasPin,
  isManager = false,
  locality,
  city,
  state,
}: {
  /**
   * Present only when this viewer has earned the exact location.
   *
   * The caller decides, and passes `null` otherwise, so the coordinates never
   * enter this subtree for a viewer who has not unlocked the contact. Taking
   * the numbers plus a `precise` flag would have read the same on screen while
   * still putting them in the rendered tree — React serialises component props
   * into the payload in development, which is exactly the sort of "invisible on
   * screen, present in source" leak this page has to avoid.
   */
  point: { latitude: number; longitude: number } | null;
  /** Whether a pin exists at all — a boolean says so without revealing it. */
  hasPin: boolean;
  /**
   * True when this viewer is the seller or the admin who posted it, so the
   * caption can say who else sees the pin. Without that the owner cannot tell
   * whether they are looking at the public view or their own.
   */
  isManager?: boolean;
  locality: string | null;
  city: string;
  state: string | null;
}) {
  // With no city there is nothing to centre on, and an empty frame is worse
  // than no frame.
  if (!city.trim()) return null;

  const exact = point !== null;
  const src = exact ? pointEmbedUrl(point) : areaEmbedUrl({ locality, city, state });
  const place = [locality, city].filter(Boolean).join(', ');

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink-800">
          <MapPin className="size-4 text-ink-400" aria-hidden />
          {exact ? 'Exact location' : 'Around this area'}
        </h3>

        {exact ? (
          <a
            href={mapsLinkFor(point)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
          >
            Open in Google Maps
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        ) : null}
      </div>

      <div className="mt-2.5 overflow-hidden rounded-field border border-ink-200">
        <iframe
          // Named for what it shows, which differs by whether it was unlocked.
          title={exact ? `Map showing ${place}` : `Map of ${place}`}
          src={src}
          // Below the fold on every screen: never let it delay the listing.
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="block h-64 w-full border-0 sm:h-80"
        />
      </div>

      <p className="mt-2 text-xs text-ink-400">
        {exact
          ? isManager
            ? 'Only you and buyers who unlock your contact see this pin. Everyone else sees the neighbourhood.'
            : 'The pin is where the seller placed it.'
          : hasPin
            ? 'Showing the neighbourhood. The exact pin appears once you unlock the contact.'
            : isManager
              ? 'No exact pin yet. Add a Google Maps link when you edit this listing.'
              : 'Showing the neighbourhood. This seller has not pinned an exact location.'}
      </p>
    </div>
  );
}
