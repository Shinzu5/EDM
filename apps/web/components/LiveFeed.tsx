'use client';

import { useEffect, useRef, useState } from 'react';
import { API_BASE, ENDPOINTS } from '@medidata/shared';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';

type ConnectionState = 'connecting' | 'open' | 'closed';

type StreamEvent = {
  type?: string;
  message?: string;
  entity?: string;
  [key: string]: unknown;
};

/**
 * Real-time sync consumer: opens an EventSource against
 * GET /api/stream/events (client-side only — EventSource is browser API),
 * surfaces incoming events (lab result released, CDC update, …) as toasts
 * and renders a "Live feed" connection indicator for the top bar.
 */
export function LiveFeed() {
  const { toast } = useToast();
  const [state, setState] = useState<ConnectionState>('connecting');
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);
  const toastFn = useRef(toast);
  toastFn.current = toast;

  useEffect(() => {
    let source: EventSource | null = null;
    try {
      source = new EventSource(`${API_BASE}${ENDPOINTS.streamEvents.path}`, {
        withCredentials: true,
      });
    } catch {
      setState('closed');
      return;
    }

    source.onopen = () => setState('open');
    source.onerror = () => setState('closed'); // EventSource auto-reconnects
    source.onmessage = (event: MessageEvent<string>) => {
      setLastEventAt(new Date().toLocaleTimeString());
      let payload: StreamEvent;
      try {
        payload = JSON.parse(event.data) as StreamEvent;
      } catch {
        payload = { message: event.data };
      }
      toastFn.current({
        title: typeof payload.type === 'string' && payload.type ? payload.type : 'Live event',
        description:
          (typeof payload.message === 'string' && payload.message) ||
          (typeof payload.entity === 'string' ? `Update on ${payload.entity}` : event.data.slice(0, 140)),
        variant: 'default',
      });
    };

    return () => {
      source?.close();
      setState('closed');
    };
  }, []);

  const label =
    state === 'open' ? 'Live feed' : state === 'connecting' ? 'Connecting…' : 'Feed offline';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium',
        state === 'open' && 'border-emerald-200 bg-emerald-50 text-emerald-700',
        state === 'connecting' && 'border-amber-200 bg-amber-50 text-amber-700',
        state === 'closed' && 'border-slate-200 bg-slate-100 text-slate-500',
      )}
      title={
        lastEventAt
          ? `GET ${ENDPOINTS.streamEvents.path} — last event ${lastEventAt}`
          : `GET ${ENDPOINTS.streamEvents.path}`
      }
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          state === 'open' && 'animate-pulse bg-emerald-500',
          state === 'connecting' && 'animate-pulse bg-amber-500',
          state === 'closed' && 'bg-slate-400',
        )}
        aria-hidden
      />
      {label}
    </span>
  );
}
