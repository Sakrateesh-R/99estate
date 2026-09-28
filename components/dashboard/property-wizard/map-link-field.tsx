'use client';

import * as React from 'react';
import { CheckCircle2, MapPin } from 'lucide-react';
import { Field, Input } from '@/components/ui/field';
import { isMapUrl, isShortMapUrl, parseMapUrl } from '@/lib/properties/map-link';

/**
 * §12 — where the property is, as a Google Maps link.
 *
 * This replaced two number fields asking for latitude and longitude, which is a
 * question a seller cannot answer about their own land. Sharing from the Maps
 * app is two taps and every seller already knows how.
 *
 * A long link has the coordinates in it, so they are read here as the seller
 * types and shown back — the confirmation that the right place was pasted. A
 * share link (`maps.app.goo.gl/…`) is an opaque id that only Google can expand,
 * so the honest thing is to say it will be looked up on save rather than fake a
 * check we cannot do in the browser.
 */
export function MapLinkField({
  value,
  error,
  onChange,
}: {
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const trimmed = value.trim();
  const touched = trimmed.length > 0;

  const point = React.useMemo(() => parseMapUrl(value), [value]);
  const short = isShortMapUrl(value);
  const recognised = isMapUrl(value);

  return (
    <div className="mt-8 border-t border-ink-200 pt-6">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
        <MapPin className="size-4 text-ink-400" aria-hidden />
        Map location
      </h3>
      <p className="mt-1 text-sm text-ink-500">
        Open the property in Google Maps, tap <strong className="font-medium">Share</strong> then{' '}
        <strong className="font-medium">Copy link</strong>, and paste it here. Buyers see the
        neighbourhood; the exact pin appears only after they unlock your contact.
      </p>

      <Field
        className="mt-4"
        label="Google Maps link (optional)"
        htmlFor="map_url"
        error={error}
      >
        <Input
          id="map_url"
          type="url"
          inputMode="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={2048}
          placeholder="https://maps.app.goo.gl/..."
          spellCheck={false}
        />
      </Field>

      {touched ? (
        point ? (
          <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-brand-700">
            <CheckCircle2 className="size-4" aria-hidden />
            Location found — {point.latitude}, {point.longitude}
          </p>
        ) : short ? (
          <p className="mt-2 text-sm text-ink-500">
            Shared link recognised. We will look up the exact spot when you save this step.
          </p>
        ) : recognised ? (
          <p className="mt-2 text-sm text-ink-500">
            This is a Maps link, but it has no position in it. If no map appears after saving, open
            the place in Maps first, then use Share &rarr; Copy link.
          </p>
        ) : (
          <p className="mt-2 text-sm text-amber-700">
            That does not look like a Google Maps link. It should start with
            {' '}<code className="font-mono text-xs">maps.app.goo.gl</code> or{' '}
            <code className="font-mono text-xs">google.com/maps</code>.
          </p>
        )
      ) : null}
    </div>
  );
}
