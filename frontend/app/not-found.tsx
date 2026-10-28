import Link from 'next/link';
import { FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-100 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-200">
        <FileQuestion className="h-7 w-7 text-slate-500" aria-hidden />
      </div>
      <h1 className="mt-4 text-2xl font-semibold text-slate-900">404 — Page not found</h1>
      <p className="mt-2 max-w-md text-sm text-slate-500">
        The route you requested does not exist in MediData.
      </p>
      <Link href="/" className="mt-5">
        <Button>Back to overview</Button>
      </Link>
    </main>
  );
}
