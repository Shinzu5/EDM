'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { rolesFor, type Action, type Subject } from '@/lib/ability';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Client gate for dashboard pages:
 *  - unauthenticated → redirect to /login
 *  - authenticated but missing the required ability → friendly 403 view
 */
export function AuthGuard({
  action = 'read',
  subject,
  children,
}: {
  action?: Action;
  subject?: Subject;
  children: React.ReactNode;
}) {
  const { user, isLoading, can } = useAuth();
  const router = useRouter();

  const allowed = !subject || can(action, subject);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login');
    }
  }, [isLoading, user, router]);

  if (isLoading) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!user) {
    // Redirect is in flight — avoid flashing page content.
    return null;
  }

  if (!allowed) {
    return <Forbidden action={action} subject={subject ?? 'this area'} />;
  }

  return <>{children}</>;
}

/** Friendly 403 view (also used by app/403.tsx). */
export function Forbidden({
  action = 'read',
  subject = 'this area',
}: {
  action?: Action;
  subject?: string;
}) {
  const router = useRouter();
  const allowed = rolesFor(action, subject as Subject)
    .filter((role) => role !== 'PATIENT')
    .join(', ');
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-50">
        <ShieldAlert className="h-7 w-7 text-rose-500" aria-hidden />
      </div>
      <h1 className="mt-4 text-2xl font-semibold text-slate-900">403 — Access denied</h1>
      <p className="mt-2 max-w-md text-sm text-slate-500">
        Your current role is not authorized to {action} <span className="font-medium">{subject}</span>.
        {allowed ? (
          <>
            {' '}
            Allowed roles: <span className="font-medium text-slate-700">{allowed}</span>.
          </>
        ) : null}
      </p>
      <div className="mt-5 flex gap-2">
        <Button variant="secondary" onClick={() => router.back()}>
          Go back
        </Button>
        <Button onClick={() => router.push('/')}>Back to overview</Button>
      </div>
    </div>
  );
}
