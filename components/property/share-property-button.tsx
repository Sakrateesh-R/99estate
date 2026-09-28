'use client';

import * as React from 'react';
import { Check, Copy, MessageCircle, Send, Share2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';

/**
 * §14 — sharing a listing.
 *
 * This is what the short URL was for. A seller circulating their own plot, or a
 * buyer sending one to whoever actually holds the chequebook, is how a listing
 * on a marketplace this size travels — and until now the only way to do it was
 * to copy the address bar.
 *
 * A menu rather than a single button, because the right destination is not
 * guessable. On a phone the native share sheet is obviously best; on a laptop it
 * usually does not exist, and WhatsApp Web is where most of these links are
 * going regardless. Offering the three explicitly beats picking wrong.
 *
 * `navigator.share` is only offered when the browser has it, and only over
 * HTTPS — it is undefined otherwise, and a menu item that does nothing is worse
 * than one that is absent.
 */
export function SharePropertyButton({
  url,
  title,
  price,
  className,
}: {
  /** Absolute canonical URL. Built on the server so a preview host cannot leak into a shared link. */
  url: string;
  title: string;
  price: string;
  className?: string;
}) {
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [canUseNative, setCanUseNative] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Read in an effect, not during render: the server has no `navigator`, and
  // branching on it directly would make the markup differ on hydration.
  React.useEffect(() => {
    setCanUseNative(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  React.useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // What lands in the message. The price is in there because it is the first
  // thing anyone receiving a property link asks.
  const message = `${title} — ${price}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      toast({ tone: 'success', title: 'Link copied' });
    } catch {
      // Clipboard access can be refused outright, and a silent failure would
      // have the user paste whatever was there before.
      toast({
        tone: 'error',
        title: 'Could not copy the link',
        description: 'Your browser blocked clipboard access. Copy it from the address bar instead.',
      });
    }
    setOpen(false);
  }

  async function shareNatively() {
    setOpen(false);
    try {
      await navigator.share({ title, text: message, url });
    } catch {
      // Dismissing the sheet rejects. That is not an error worth reporting.
    }
  }

  const items = [
    {
      key: 'whatsapp',
      label: 'WhatsApp',
      icon: MessageCircle,
      href: `https://wa.me/?text=${encodeURIComponent(`${message}\n${url}`)}`,
    },
    {
      key: 'telegram',
      label: 'Telegram',
      icon: Send,
      href: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(message)}`,
    },
  ];

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          'inline-flex h-11 items-center justify-center gap-2 rounded-field border border-ink-300 bg-white px-4 text-[0.9375rem] font-semibold text-ink-700 transition-colors hover:border-ink-400 hover:bg-ink-50',
          className,
        )}
      >
        <Share2 className="size-4" aria-hidden />
        Share
      </button>

      {open ? (
        <div
          role="menu"
          className="animate-fade-up absolute right-0 top-13 z-40 w-56 overflow-hidden rounded-card border border-ink-200 bg-white py-1 shadow-pop"
        >
          {items.map(({ key, label, icon: Icon, href }) => (
            <a
              key={key}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-ink-700 transition-colors hover:bg-ink-50 hover:text-ink-950"
            >
              <Icon className="size-4 text-ink-400" aria-hidden />
              {label}
            </a>
          ))}

          <button
            type="button"
            role="menuitem"
            onClick={copyLink}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-ink-700 transition-colors hover:bg-ink-50 hover:text-ink-950"
          >
            {copied ? (
              <Check className="size-4 text-brand-600" aria-hidden />
            ) : (
              <Copy className="size-4 text-ink-400" aria-hidden />
            )}
            {copied ? 'Copied' : 'Copy link'}
          </button>

          {canUseNative ? (
            <button
              type="button"
              role="menuitem"
              onClick={shareNatively}
              className="flex w-full items-center gap-2.5 border-t border-ink-100 px-4 py-2.5 text-left text-sm text-ink-700 transition-colors hover:bg-ink-50 hover:text-ink-950"
            >
              <Share2 className="size-4 text-ink-400" aria-hidden />
              More apps…
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
