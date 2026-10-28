'use client';

import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Modal dialog built on the native <dialog> element (no radix installed).
 * `showModal()` gives us focus trapping, Escape handling and ::backdrop for
 * free; we intercept `cancel` so the parent owns the open state.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onOpenChange(false);
      }}
      onClick={(event) => {
        // Click on the backdrop (the dialog element itself) closes it.
        if (event.target === ref.current) onOpenChange(false);
      }}
      className={cn(
        'w-full max-w-lg rounded-lg border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-900/50',
        className,
      )}
    >
      <div className="flex items-start justify-between border-b border-slate-100 px-4 py-3">
        <div>
          <h2 id={titleId} className="text-sm font-semibold text-slate-900">
            {title}
          </h2>
          {description ? (
            <p id={descId} className="mt-0.5 text-xs text-slate-500">
              {description}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="Close dialog"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="px-4 py-3 text-sm text-slate-700">{children}</div>
      {footer ? (
        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3">
          {footer}
        </div>
      ) : null}
    </dialog>
  );
}
