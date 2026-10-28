'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Activity, ChevronRight, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { NAV_SECTIONS, BREADCRUMB_LABELS, type NavItem } from '@/lib/nav';
import { AuthGuard } from '@/components/AuthGuard';
import { LiveFeed } from '@/components/LiveFeed';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

const ROLE_BADGE: Record<string, 'purple' | 'info' | 'success' | 'warning' | 'danger' | 'default'> = {
  ADMIN: 'danger',
  PHYSICIAN: 'info',
  LAB_TECH: 'purple',
  BILLER: 'warning',
  ANALYST: 'success',
  AUDITOR: 'default',
  PATIENT: 'info',
};

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { can } = useAuth();

  const visible = useMemo(
    () =>
      NAV_SECTIONS.map((section) => ({
        ...section,
        items: section.items.filter((item: NavItem) => can(item.action, item.subject)),
      })).filter((section) => section.items.length > 0),
    [can],
  );

  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Main">
      {visible.map((section) => (
        <div key={section.title}>
          <p className="px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            {section.title}
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {section.items.map((item) => {
              const active =
                item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                      active
                        ? 'bg-brand-600/20 text-white shadow-sm'
                        : 'text-slate-300 hover:bg-sidebar-800 hover:text-white',
                    )}
                    aria-current={active ? 'page' : undefined}
                  >
                    <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-brand-100' : 'text-slate-400')} />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Breadcrumb() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);
  const crumbs = segments.map((segment, index) => ({
    label: BREADCRUMB_LABELS[segment] ?? segment,
    href: `/${segments.slice(0, index + 1).join('/')}`,
  }));

  return (
    <nav aria-label="Breadcrumb" className="hidden items-center gap-1 text-xs text-slate-500 md:flex">
      <Link href="/" className="hover:text-brand-700">
        MediData
      </Link>
      {crumbs.map((crumb, index) => (
        <span key={crumb.href} className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3 text-slate-400" />
          {index === crumbs.length - 1 ? (
            <span className="font-medium text-slate-800">{crumb.label}</span>
          ) : (
            <Link href={crumb.href} className="hover:text-brand-700">
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-800 bg-sidebar-900 lg:flex">
        <div className="flex items-center gap-2 border-b border-sidebar-800 px-4 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
            <Activity className="h-5 w-5 text-white" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">MediData</p>
            <p className="truncate text-[10px] text-slate-400">Enterprise Data Mgmt</p>
          </div>
        </div>
        <NavLinks />
        <p className="border-t border-sidebar-800 px-4 py-3 text-[10px] leading-4 text-slate-500">
          Synthetic data only — no real PHI.
        </p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur">
          <Link href="/" className="flex items-center gap-2 lg:hidden">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-600">
              <Activity className="h-4 w-4 text-white" aria-hidden />
            </span>
            <span className="text-sm font-semibold">MediData</span>
          </Link>
          <Breadcrumb />
          <div className="ml-auto flex items-center gap-2">
            <LiveFeed />
            <div className="hidden items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 sm:flex">
              <span className="max-w-[10rem] truncate text-xs font-medium text-slate-700">
                {user?.fullName ?? '…'}
              </span>
              <Badge variant={user ? ROLE_BADGE[user.role] ?? 'default' : 'default'}>
                {user?.role ?? '—'}
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await logout();
                router.replace('/login');
              }}
              aria-label="Log out"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="lg:hidden"
              onClick={() => setMobileNavOpen((open) => !open)}
              aria-expanded={mobileNavOpen}
            >
              Menu
            </Button>
          </div>
        </header>

        {/* Mobile nav drawer */}
        {mobileNavOpen ? (
          <div className="border-b border-sidebar-800 bg-sidebar-900 lg:hidden">
            <NavLinks onNavigate={() => setMobileNavOpen(false)} />
          </div>
        ) : null}

        <main className="min-w-0 flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}

/** Dashboard shell: auth gate (redirect / 403) + sidebar + top bar. */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <Shell>{children}</Shell>
    </AuthGuard>
  );
}
