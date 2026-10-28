'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Home, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Next.js error boundary for the root segment — always client-side. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Hook point for centralized error reporting.
    console.error('[medidata] render error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main className="flex min-h-screen flex-col items-center justify-center bg-slate-100 px-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-2xl">
            ⚠️
          </div>
          <h1 className="mt-4 text-2xl font-semibold text-slate-900">Something broke</h1>
          <p className="mt-2 max-w-md text-sm text-slate-500">
            An unexpected client error occurred
            {error.digest ? <span className="font-mono"> ({error.digest})</span> : null}. Retrying
            usually clears it.
          </p>
          <div className="mt-5 flex gap-2">
            <Button onClick={reset}>
              <RefreshCw className="h-4 w-4" aria-hidden /> Try again
            </Button>
            <Link href="/">
              <Button variant="secondary">
                <Home className="h-4 w-4" aria-hidden /> Home
              </Button>
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}
