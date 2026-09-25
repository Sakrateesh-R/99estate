'use client';

import * as React from 'react';
import { CheckCircle2, AlertTriangle, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastTone = 'success' | 'error' | 'info' | 'warning';

type Toast = {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
};

type ToastInput = Omit<Toast, 'id' | 'tone'> & { tone?: ToastTone };

const ToastContext = React.createContext<((toast: ToastInput) => void) | null>(null);

/**
 * Minimal toast system (§20). Deliberately dependency-free: the whole surface
 * is "tell the user something happened", and a headless UI library would be
 * more bytes than the feature.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const nextId = React.useRef(0);

  const dismiss = React.useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const push = React.useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-2), { id, tone: input.tone ?? 'info', ...input }]);
      // Errors stay longer — they usually need reading, not just noticing.
      window.setTimeout(() => dismiss(id), input.tone === 'error' ? 7000 : 4500);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        // Bottom on mobile (thumb reach, away from the sticky unlock CTA is not
        // possible, so it sits above it), top-right from `sm` up.
        className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-auto sm:left-auto sm:right-4 sm:top-4 sm:items-end"
        role="region"
        aria-label="Notifications"
      >
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const TONE_STYLE: Record<ToastTone, { ring: string; icon: React.ReactNode }> = {
  success: { ring: 'ring-brand-200', icon: <CheckCircle2 className="size-5 text-brand-600" /> },
  error: { ring: 'ring-red-200', icon: <XCircle className="size-5 text-red-600" /> },
  warning: { ring: 'ring-amber-200', icon: <AlertTriangle className="size-5 text-amber-600" /> },
  info: { ring: 'ring-ink-200', icon: <Info className="size-5 text-ink-500" /> },
};

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const style = TONE_STYLE[toast.tone];
  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'animate-fade-up pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-card bg-white p-4 shadow-pop ring-1',
        style.ring,
      )}
    >
      <span className="mt-0.5 shrink-0">{style.icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink-900">{toast.title}</p>
        {toast.description ? <p className="mt-0.5 text-sm text-ink-600">{toast.description}</p> : null}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="-m-1 rounded p-1 text-ink-400 transition-colors hover:text-ink-700"
        aria-label="Dismiss notification"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

export function useToast() {
  const push = React.useContext(ToastContext);
  if (!push) throw new Error('useToast must be used inside <ToastProvider>');
  return push;
}
