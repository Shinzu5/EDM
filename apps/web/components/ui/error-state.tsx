'use client';

import { AlertTriangle, PlugZap, RefreshCw, WifiOff } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

function describe(error: unknown): { title: string; detail: string; offline: boolean } {
  if (error instanceof ApiError) {
    if (error.isOffline) {
      return {
        title: 'API offline — start apps/api',
        detail: 'The backend at http://localhost:4000 is unreachable. All figures will resume once it is back.',
        offline: true,
      };
    }
    return { title: `Request failed (${error.code})`, detail: error.message, offline: false };
  }
  if (error instanceof Error) return { title: 'Something went wrong', detail: error.message, offline: false };
  return { title: 'Something went wrong', detail: 'Unexpected error while loading this view.', offline: false };
}

/** Inline error panel with retry — used as the error state on every page. */
export function ErrorState({
  error,
  onRetry,
  title,
  compact,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
  compact?: boolean;
  className?: string;
}) {
  const { title: autoTitle, detail, offline } = describe(error);
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-start gap-2 rounded-lg border border-amber-200 bg-amber-50',
        compact ? 'px-3 py-2.5' : 'px-4 py-4',
        className,
      )}
    >
      <div className="flex items-center gap-2 text-amber-800">
        {offline ? (
          <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
        ) : (
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        )}
        <p className="text-sm font-semibold">{title ?? autoTitle}</p>
      </div>
      <p className="text-xs leading-5 text-amber-700">{detail}</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry} className="mt-1">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Retry
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Compact shell-level banner driven by the fetch error path (subscribeApiEvents).
 * Rendered by the dashboard layout so no page is ever a blank screen when the
 * API is down.
 */
export function ApiOfflineBanner({ offline, onRetry }: { offline: boolean; onRetry?: () => void }) {
  if (!offline) return null;
  return (
    <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-800">
      <PlugZap className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="font-semibold">API offline — start apps/api.</span>
      <span className="hidden text-amber-700 sm:inline">
        Data shown may be stale; actions will fail until http://localhost:4000 is up.
      </span>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="ml-auto rounded border border-amber-300 px-2 py-0.5 font-medium hover:bg-amber-100"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}
