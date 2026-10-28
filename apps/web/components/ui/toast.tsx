'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@/lib/cn';

export type ToastVariant = 'default' | 'success' | 'error';

export type ToastInput = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** ms; 0 keeps it until dismissed. Defaults: 5s, errors 9s. */
  duration?: number;
};

type ToastItem = {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
  duration: number;
};

type ToastContextValue = { toast: (input: ToastInput) => void; dismiss: (id: number) => void };

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS: Record<ToastVariant, typeof Info> = {
  default: Info,
  success: CheckCircle2,
  error: AlertCircle,
};

const TONES: Record<ToastVariant, string> = {
  default: 'border-slate-200',
  success: 'border-emerald-200',
  error: 'border-rose-200',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      const variant = input.variant ?? 'default';
      const duration = input.duration ?? (variant === 'error' ? 9_000 : 5_000);
      setToasts((current) => [...current.slice(-4), { ...input, variant, duration, id }]);
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
    },
    [dismiss],
  );

  useEffect(() => {
    const timerMap = timers.current;
    return () => {
      for (const timer of timerMap.values()) clearTimeout(timer);
      timerMap.clear();
    };
  }, []);

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastRail toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastRail({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || toasts.length === 0) return null;

  return createPortal(
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2">
      {toasts.map((item) => {
        const Icon = ICONS[item.variant];
        return (
          <div
            key={item.id}
            role="status"
            className={cn(
              'pointer-events-auto flex items-start gap-2 rounded-lg border bg-white p-3 shadow-lg',
              TONES[item.variant],
            )}
          >
            <Icon
              className={cn(
                'mt-0.5 h-4 w-4 shrink-0',
                item.variant === 'success' && 'text-emerald-600',
                item.variant === 'error' && 'text-rose-600',
                item.variant === 'default' && 'text-brand-600',
              )}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-900">{item.title}</p>
              {item.description ? (
                <p className="mt-0.5 break-words text-xs text-slate-500">{item.description}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(item.id)}
              className="rounded p-0.5 text-slate-400 hover:text-slate-600"
              aria-label="Dismiss notification"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
