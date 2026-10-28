'use client';

import { Suspense, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Activity, KeyRound, LogIn, TriangleAlert } from 'lucide-react';
import { ROLES, type Role } from '@medidata/shared';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/** Demo accounts seeded by packages/db/src/seed.ts — password for all. */
const DEMO_PASSWORD = 'Passw0rd!123';
const DEMO_ACCOUNTS: Array<{ role: Role; email: string }> = [
  { role: 'ADMIN', email: 'admin@medidata.local' },
  { role: 'PHYSICIAN', email: 'physician@medidata.local' },
  { role: 'LAB_TECH', email: 'labtech@medidata.local' },
  { role: 'BILLER', email: 'biller@medidata.local' },
  { role: 'ANALYST', email: 'analyst@medidata.local' },
  { role: 'AUDITOR', email: 'auditor@medidata.local' },
  { role: 'PATIENT', email: 'patient@medidata.local' },
];

function LoginShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel */}
      <div className="hidden flex-col justify-between bg-sidebar-900 p-10 lg:flex">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600">
            <Activity className="h-5 w-5 text-white" aria-hidden />
          </span>
          <span className="text-base font-semibold text-white">MediData</span>
        </div>
        <div>
          <h1 className="max-w-md text-3xl font-semibold leading-tight text-white">
            Healthcare Enterprise Data Management
          </h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-slate-400">
            Master data management, data quality, lineage and analytics for synthetic clinical,
            lab, claims and payer data — one governed platform.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-slate-300">
            <li>• Patient 360 with consent-aware PHI access</li>
            <li>• ISO 15189-gated lab result release workflow</li>
            <li>• DQ scorecards, freshness SLAs and audit trail</li>
          </ul>
        </div>
        <p className="text-xs text-slate-500">All data is synthetic — no real PHI.</p>
      </div>
      {/* Form panel */}
      <div className="flex items-center justify-center bg-slate-100 p-6">{children}</div>
    </div>
  );
}

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, isLoggingIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(
    searchParams.get('expired') ? 'Your session expired — please sign in again.' : null,
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      const user = await login(email.trim(), password);
      router.replace(user.role === 'PATIENT' ? '/portal' : '/');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.isOffline ? err.message : `${err.code}: ${err.message}`);
      } else {
        setError('Unexpected error — please try again.');
      }
    }
  }

  return (
    <LoginShell>
      <div className="w-full max-w-md space-y-4">
        <div className="lg:hidden">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
              <Activity className="h-5 w-5 text-white" aria-hidden />
            </span>
            <span className="text-base font-semibold text-slate-900">MediData</span>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sign in</CardTitle>
            <CardDescription>Use a seeded demo account or your own credentials.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Email</span>
                <Input
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="admin@medidata.local"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Password</span>
                <Input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                />
              </label>

              {error ? (
                <p
                  role="alert"
                  className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"
                >
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  {error}
                </p>
              ) : null}

              <Button type="submit" className="w-full" loading={isLoggingIn}>
                <LogIn className="h-4 w-4" aria-hidden /> Sign in
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5 text-sm">
              <KeyRound className="h-3.5 w-3.5 text-slate-400" aria-hidden /> Demo accounts
            </CardTitle>
            <CardDescription>
              Password for all: <span className="font-mono font-medium">{DEMO_PASSWORD}</span> — click
              a row to fill the form.
            </CardDescription>
          </CardHeader>
          <div className="overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-1.5 font-semibold">Role</th>
                  <th className="px-4 py-1.5 font-semibold">Email</th>
                </tr>
              </thead>
              <tbody>
                {DEMO_ACCOUNTS.map((account) => (
                  <tr
                    key={account.email}
                    className="cursor-pointer border-t border-slate-100 hover:bg-brand-50"
                    onClick={() => {
                      setEmail(account.email);
                      setPassword(DEMO_PASSWORD);
                      setError(null);
                    }}
                  >
                    <td className="px-4 py-1.5 font-medium text-slate-700">{account.role}</td>
                    <td className="px-4 py-1.5 font-mono text-slate-500">{account.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <p className="text-center text-[11px] text-slate-400">
          {ROLES.length} roles · CASL-style authorization · PHI masked per role
        </p>
      </div>
    </LoginShell>
  );
}

/** Next.js requires a Suspense boundary around useSearchParams during build. */
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-100 text-sm text-slate-500">
          Loading…
        </div>
      }
    >
      <LoginInner />
    </Suspense>
  );
}
