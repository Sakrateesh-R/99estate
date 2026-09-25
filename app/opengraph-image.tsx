import { ImageResponse } from 'next/og';
import { SITE_NAME, FREE_DAILY_UNLOCKS, PAID_UNLOCK_PRICE } from '@/lib/constants';

/**
 * §23 — the default social preview.
 *
 * Without this, every share of the home page and the static pages renders as
 * a bare blue link. WhatsApp is where Indian property links actually travel,
 * and a link with no card attached looks broken next to one that has a card.
 *
 * Listing pages override this with their own photo, which is always a better
 * preview than anything generic. This covers everything else.
 *
 * Drawn rather than shipped as a file so the pricing in it cannot drift from
 * `lib/constants` — the numbers are the whole pitch.
 */

export const alt = `${SITE_NAME} — browse property free, ${FREE_DAILY_UNLOCKS} seller contacts free every day`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          background: 'linear-gradient(135deg, #0c4538 0%, #0c6852 55%, #0f8364 100%)',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              background: '#78d9b5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 34,
              fontWeight: 700,
              color: '#0c4538',
            }}
          >
            99
          </div>
          <div style={{ fontSize: 38, fontWeight: 700, color: '#ffffff', letterSpacing: -0.5 }}>
            {SITE_NAME}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              fontSize: 76,
              fontWeight: 700,
              color: '#ffffff',
              lineHeight: 1.05,
              letterSpacing: -2,
            }}
          >
            Browse property free.
          </div>
          <div
            style={{
              fontSize: 76,
              fontWeight: 700,
              color: '#78d9b5',
              lineHeight: 1.05,
              letterSpacing: -2,
            }}
          >
            Pay only to connect.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Pill>{FREE_DAILY_UNLOCKS} free contacts daily</Pill>
          {/*
            "Rs" rather than "₹" on purpose. The font ImageResponse falls back
            to has no Rupee glyph, so the symbol renders as an empty box — and
            a broken character sitting on the one number that carries the
            pricing is worse than spelling it out. The rest of the site uses ₹;
            only this generated image cannot.
          */}
          <Pill>Rs {PAID_UNLOCK_PRICE} per contact after</Pill>
          <Pill>Posting always free</Pill>
        </div>
      </div>
    ),
    size,
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        padding: '14px 26px',
        borderRadius: 999,
        background: 'rgba(255,255,255,0.12)',
        border: '1px solid rgba(255,255,255,0.28)',
        fontSize: 26,
        color: '#eefbf5',
      }}
    >
      {children}
    </div>
  );
}
