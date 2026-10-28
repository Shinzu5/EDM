'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/lib/auth';
import { setApiErrorNotifier, subscribeApiEvents, type ApiError } from '@/lib/api';
import { ToastProvider, useToast } from '@/components/ui/toast';
import { ApiOfflineBanner } from '@/components/ui/error-state';

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });
}

/** Bridges the fetch client's error hook point into the toast system. */
function ApiErrorBridge() {
  const { toast } = useToast();
  useEffect(() => {
    setApiErrorNotifier((error: ApiError) => {
      if (error.isOffline) return; // offline banner handles that case
      if (error.status === 401) return; // redirect handles that case
      toast({ title: error.code, description: error.message, variant: 'error' });
    });
    return () => setApiErrorNotifier(null);
  }, [toast]);
  return null;
}

/** Shell-level API status: listens to the fetch error path, shows a banner. */
function ApiStatusProvider({ children }: { children: ReactNode }) {
  const [offline, setOffline] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return subscribeApiEvents((event) => setOffline(event.type === 'offline'));
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      {mounted ? <ApiOfflineBanner offline={offline} /> : null}
      <div className="flex-1">{children}</div>
    </div>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <ApiErrorBridge />
          <ApiStatusProvider>{children}</ApiStatusProvider>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
