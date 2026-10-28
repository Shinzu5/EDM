'use client';

import dynamic from 'next/dynamic';
import { ArrowDown, ArrowUp, Minus, Sparkles, Target } from 'lucide-react';
import { ENDPOINTS, type OutcomeKpis } from '@medidata/shared';
import { useApiQuery } from '@/lib/queries';
import { formatNumber, formatPercent } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';
import { ChartSkeleton } from '@/components/charts/common';

const OutcomesBarChart = dynamic(() => import('@/components/charts/outcomes-bar'), {
  ssr: false,
  loading: () => <ChartSkeleton height={280} />,
});

type DeltaCardProps = {
  label: string;
  unit: 'percent' | 'hours' | 'score';
  before: number;
  after: number;
  /** Lower is better (rates, TAT, lag) vs higher is better (scores). */
  lowerIsBetter: boolean;
};

function DeltaCard({ label, unit, before, after, lowerIsBetter }: DeltaCardProps) {
  const delta = after - before;
  const improved = lowerIsBetter ? delta <= 0 : delta >= 0;
  const flat = Math.abs(delta) < 1e-9;
  const Arrow = flat ? Minus : delta > 0 ? ArrowUp : ArrowDown;

  const fmt = (value: number) =>
    unit === 'percent'
      ? formatPercent(value, 2)
      : unit === 'hours'
        ? `${formatNumber(value, 1)} h`
        : formatNumber(value, Number.isInteger(value) ? 0 : 2);

  return (
    <Card>
      <CardContent>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <div className="mt-2 flex items-end gap-3">
          <div>
            <p className="text-[11px] text-slate-400">before</p>
            <p className="text-lg font-semibold tabular-nums text-slate-500 line-through decoration-slate-300">
              {fmt(before)}
            </p>
          </div>
          <div className={cn('flex items-center gap-1 pb-1', flat ? 'text-slate-400' : improved ? 'text-emerald-600' : 'text-rose-600')}>
            <Arrow className="h-4 w-4" aria-hidden />
            <span className="text-xs font-semibold">{fmt(Math.abs(delta))}</span>
          </div>
          <div className="ml-auto text-right">
            <p className="text-[11px] text-slate-400">after</p>
            <p className={cn('text-lg font-semibold tabular-nums', improved ? 'text-emerald-700' : 'text-slate-800')}>
              {fmt(after)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function OutcomesPage() {
  const query = useApiQuery<OutcomeKpis>(['kpis', 'outcomes'], ENDPOINTS.kpisOutcomes.path);

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28 w-full" />
          ))}
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="space-y-4">
        <PageHeader title="Outcomes" description="Before/after impact of the EDM program." />
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </div>
    );
  }

  const kpis = query.data;
  const chartData = [
    { metric: 'Duplicate rate %', before: kpis.duplicateRateBefore, after: kpis.duplicateRateAfter },
    { metric: 'Avg TAT (h)', before: kpis.avgTatBefore, after: kpis.avgTatAfter },
    { metric: 'Billing lag', before: kpis.billingLagBefore, after: kpis.billingLagAfter },
    { metric: 'DQ score', before: kpis.dqScore, after: kpis.dqScore },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Outcomes"
        description="Measure success by outcomes — EDM program impact, before vs after."
        actions={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            <Sparkles className="h-3.5 w-3.5" aria-hidden /> DQ score {kpis.dqScore}/100
          </span>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DeltaCard
          label="Duplicate rate"
          unit="percent"
          before={kpis.duplicateRateBefore}
          after={kpis.duplicateRateAfter}
          lowerIsBetter
        />
        <DeltaCard label="Avg turnaround time" unit="hours" before={kpis.avgTatBefore} after={kpis.avgTatAfter} lowerIsBetter />
        <DeltaCard label="Billing lag" unit="score" before={kpis.billingLagBefore} after={kpis.billingLagAfter} lowerIsBetter />
        <DeltaCard label="Data quality score" unit="score" before={kpis.dqScore} after={kpis.dqScore} lowerIsBetter={false} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <Target className="h-4 w-4 text-brand-600" aria-hidden /> Program impact comparison
          </CardTitle>
          <CardDescription>
            Before = pre-MDM / pre-governance baseline · After = current measured values (GET{' '}
            {ENDPOINTS.kpisOutcomes.path})
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OutcomesBarChart data={chartData} />
          <p className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
            Duplicate rate and turnaround time improved after MDM golden-record survivorship and DQ
            gates went live; billing lag reflects faster denial routing. DQ score is measured
            directly by the rule engine — see Governance → Data Quality.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
