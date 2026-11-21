import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * Shared toast notifications.
 *
 * Replaces the per-page inline success/error banners so a save, reset or
 * deactivation reports back once and then gets out of the way.
 */

export type ToastVariant = 'success' | 'error' | 'info' | 'warning';

type ToastItem = {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
  duration: number;
};

type PushInput = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** Milliseconds before auto-dismiss. Use 0 to keep it until closed. */
  duration?: number;
};

type ToastApi = {
  push: (toast: PushInput) => number;
  success: (title: string, description?: string, duration?: number) => number;
  error: (title: string, description?: string, duration?: number) => number;
  info: (title: string, description?: string, duration?: number) => number;
  warning: (title: string, description?: string, duration?: number) => number;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastApi>({
  push: () => 0,
  success: () => 0,
  error: () => 0,
  info: () => 0,
  warning: () => 0,
  dismiss: () => {},
});

export const useToast = () => useContext(ToastContext);

const TONE: Record<ToastVariant, { box: string; icon: string }> = {
  success: { box: 'border-emerald-200', icon: 'bg-emerald-50 text-emerald-600' },
  error: { box: 'border-rose-200', icon: 'bg-rose-50 text-rose-600' },
  warning: { box: 'border-amber-200', icon: 'bg-amber-50 text-amber-600' },
  info: { box: 'border-sky-200', icon: 'bg-sky-50 text-sky-600' },
};

const TONE_ICON: Record<ToastVariant, typeof Info> = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  useEffect(() => {
    if (!toast.duration) return;
    const timer = window.setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => window.clearTimeout(timer);
  }, [toast.duration, toast.id, onDismiss]);

  const Icon = TONE_ICON[toast.variant];

  return (
    <div
      role="status"
      className={cn(
        'toast-enter pointer-events-auto flex w-[min(23rem,calc(100vw-2rem))] items-start gap-3 rounded-xl border bg-white p-3.5 shadow-lg shadow-slate-900/10',
        TONE[toast.variant].box
      )}
    >
      <span className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', TONE[toast.variant].icon)}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-slate-900">{toast.title}</p>
        {toast.description && (
          <p className="mt-0.5 break-words text-[11px] leading-relaxed text-slate-500">{toast.description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
        aria-label="Dismiss notification"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const push = useCallback((input: PushInput) => {
    const id = ++seq.current;
    const item: ToastItem = {
      id,
      title: input.title,
      description: input.description,
      variant: input.variant ?? 'info',
      duration: input.duration ?? 4500,
    };
    setItems((prev) => [...prev.slice(-4), item]);
    return id;
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      push,
      dismiss,
      success: (title, description, duration) => push({ title, description, variant: 'success', duration }),
      error: (title, description, duration) => push({ title, description, variant: 'error', duration }),
      info: (title, description, duration) => push({ title, description, variant: 'info', duration }),
      warning: (title, description, duration) => push({ title, description, variant: 'warning', duration }),
    }),
    [push, dismiss]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed right-4 top-4 z-[200] flex flex-col gap-2">
          {items.map((toast) => (
            <ToastCard key={toast.id} toast={toast} onDismiss={dismiss} />
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}
