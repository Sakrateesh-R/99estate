'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

/**
 * Modal built on the native <dialog> element.
 *
 * `showModal()` gives us focus trapping, inert background, Escape handling and
 * the top layer for free — all things a hand-rolled overlay gets subtly wrong.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  const ref = React.useRef<HTMLDialogElement>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  // Lock background scroll while the dialog is up.
  React.useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // Clicks land on the backdrop when the target is the dialog itself.
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        'w-full max-w-[min(32rem,calc(100%-2rem))] rounded-card bg-white p-0 text-ink-900 shadow-pop',
        'backdrop:bg-ink-950/50 backdrop:backdrop-blur-[2px]',
        'open:animate-fade-up',
        className,
      )}
      aria-labelledby="dialog-title"
    >
      <div className="flex items-start justify-between gap-4 p-5 pb-0 sm:p-6 sm:pb-0">
        <div>
          <h2 id="dialog-title" className="text-lg font-semibold">
            {title}
          </h2>
          {description ? <p className="mt-1 text-sm text-ink-500">{description}</p> : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="-m-1.5 rounded p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
          aria-label="Close"
        >
          <X className="size-5" />
        </button>
      </div>

      {children ? <div className="p-5 sm:p-6">{children}</div> : <div className="h-4" />}

      {footer ? (
        <div className="flex flex-col-reverse gap-2 border-t border-ink-100 p-5 sm:flex-row sm:justify-end sm:p-6">
          {footer}
        </div>
      ) : null}
    </dialog>
  );
}

/** Destructive-action confirmation (§20). */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
