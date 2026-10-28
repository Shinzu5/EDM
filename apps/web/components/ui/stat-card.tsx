import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Card, CardContent } from '@/components/ui/card';

const TONES: Record<string, string> = {
  slate: 'bg-slate-100 text-slate-600',
  brand: 'bg-brand-50 text-brand-700',
  success: 'bg-emerald-50 text-emerald-600',
  warning: 'bg-amber-50 text-amber-600',
  danger: 'bg-rose-50 text-rose-600',
  purple: 'bg-violet-50 text-violet-600',
};

/** Compact KPI card used across the dashboard and summary rows. */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'slate',
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  tone?: keyof typeof TONES;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 truncate text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
          {hint ? <p className="mt-1 truncate text-xs text-slate-500">{hint}</p> : null}
        </div>
        {Icon ? (
          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', TONES[tone])}>
            <Icon className="h-5 w-5" aria-hidden />
          </span>
        ) : null}
      </CardContent>
    </Card>
  );
}
