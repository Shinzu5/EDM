'use client';

import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { Forbidden } from '@/components/AuthGuard';
import { Button } from '@/components/ui/button';

/** Standalone 403 route (also rendered inline by AuthGuard). */
export default function ForbiddenPage() {
  return (
    <main className="min-h-screen bg-slate-100">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
        <span className="text-sm font-semibold text-slate-900">MediData</span>
        <Link href="/">
          <Button variant="secondary" size="sm">
            <ShieldAlert className="h-4 w-4" aria-hidden /> Dashboard
          </Button>
        </Link>
      </div>
      <Forbidden subject="this resource" />
    </main>
  );
}
