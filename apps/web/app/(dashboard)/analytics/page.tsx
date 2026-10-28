'use client';

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { format } from 'date-fns';
import { BarChart3, Clock, RefreshCw } from 'lucide-react';
import {
  ENDPOINTS,
  type Claim,
  type Encounter,
  type FreshnessStatus,
  type InsurancePolicy,
  type LabResult,
} from '@medidata/shared';
import { useApiQuery } from '@/lib/queries';
import { hoursBetween, toDate } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartSkeleton } from '@/components/charts/common';

const DonutChart = dynamic(() => import('@/components/charts/donut'), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});
const ResultsByMonthChart = dynamic(() => import('@/components/charts/results-by-month'), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});
const ClaimsByStatusChart = dynamic(() => import('@/components/charts/claims-by-status'), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});

type LinePoint = { month: string; count: number };
type HistogramPoint = { bucket: string; count: number };

function monthlyTat(results: LabResult[]): LinePoint[] {
  const buckets = new Map<string, { total: number; n: number }>();
  for (const result of results) {
    const hours = hoursBetween(result.collectedAt, result.resultedAt);
    if (hours === null || hours < 0) continue;
    const date = toDate(result.resultedAt);
    if (!date) continue;
    const key = format(date, 'yyyy-MM');
    const entry = buckets.get(key) ?? { total: 0, n: 0 };
    entry.total += hours;
    entry.n += 1;
    buckets.set(key, entry);
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, entry]) => ({ month, count: Math.round((entry.total / entry.n) * 10) / 10 }));
}

const LAG_BUCKETS_HOURS: Array<{ label: string; max: number }> = [
  { label: '<24h', max: 24 },
  { label: '1-3d', max: 72 },
  { label: '3-7d', max: 168 },
  { label: '1-2w', max: 336 },
  { label: '2-4w', max: 672 },
  { label: '>4w', max: Number.POSITIVE_INFINITY },
];

function paymentLagHistogram(claims: Claim[]): HistogramPoint[] {
  const counts = LAG_BUCKETS_HOURS.map((bucket) => ({ bucket: bucket.label, count: 0 }));
  for (const claim of claims) {
    const submitted = toDate(claim.submittedAt);
    const paid = toDate(claim.paidAt);
    if (!submitted || !paid) continue;
    const hours = (paid.getTime() - submitted.getTime()) / 3_600_000;
    if (hours < 0) continue;
    const index = LAG_BUCKETS_HOURS.findIndex((bucket) => hours < bucket.max);
    if (index >= 0) counts[index].count += 1;
  }
  return counts;
}

function ChartPanel({
  title,
  description,
  loading,
  error,
  onRetry,
  isEmpty,
  children,
}: {
  title: string;
  description: string;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  isEmpty: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <ChartSkeleton />
        ) : error ? (
          <ErrorState compact error={error} onRetry={onRetry} />
        ) : isEmpty ? (
          <EmptyState icon={BarChart3} title="No data to chart" description="Run the pipeline to populate this mart." />
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

export default function AnalyticsPage() {
  const encounters = useApiQuery<Encounter[]>(['analytics', 'encounters'], ENDPOINTS.encounters.path);
  const results = useApiQuery<LabResult[]>(['analytics', 'lab-results'], ENDPOINTS.labResults.path);
  const claims = useApiQuery<Claim[]>(['analytics', 'claims'], ENDPOINTS.claims.path);
  const policies = useApiQuery<InsurancePolicy[]>(['analytics', 'policies'], ENDPOINTS.insurancePolicies.path, {
    staleTime: 60_000,
  });
  const freshness = useApiQuery<FreshnessStatus[]>(['analytics', 'freshness'], ENDPOINTS.governanceFreshness.path);

  const encounterTypeSlices = useMemo(() => {
    const counts = new Map<string, number>();
    for (const encounter of encounters.data ?? []) {
      counts.set(encounter.type, (counts.get(encounter.type) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([name, value]) => ({ name, value }));
  }, [encounters.data]);

  const payerMixSlices = useMemo(() => {
    const counts = new Map<string, number>();
    for (const policy of policies.data ?? []) {
      counts.set(policy.payerName, (counts.get(policy.payerName) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([name, value]) => ({ name, value }));
  }, [policies.data]);

  const tatTrend = useMemo(() => monthlyTat(results.data ?? []), [results.data]);
  const lagHistogram = useMemo(() => paymentLagHistogram(claims.data ?? []), [claims.data]);

  const anyLoading =
    encounters.isLoading || results.isLoading || claims.isLoading || policies.isLoading;
  const retryAll = () => {
    void encounters.refetch();
    void results.refetch();
    void claims.refetch();
    void policies.refetch();
    void freshness.refetch();
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Analytics"
        description="Marts built by the pipeline: encounters, TAT, payment lag and payer mix."
        actions={
          <Badge variant="info">
            {encounters.data?.length ?? 0} enc · {results.data?.length ?? 0} res · {claims.data?.length ?? 0} clm
          </Badge>
        }
      />

      {anyLoading ? <Skeleton className="h-16 w-full" /> : null}
      {!anyLoading && (encounters.isError || results.isError || claims.isError || policies.isError) ? (
        <ErrorState error={encounters.error ?? results.error ?? claims.error ?? policies.error} onRetry={retryAll} />
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartPanel
          title="Encounters by type"
          description="Case-mix split across INPATIENT / OUTPATIENT / EMERGENCY / TELEHEALTH"
          loading={encounters.isLoading}
          error={encounters.error}
          onRetry={() => void encounters.refetch()}
          isEmpty={encounterTypeSlices.length === 0}
        >
          <DonutChart data={encounterTypeSlices} />
        </ChartPanel>

        <ChartPanel
          title="Lab TAT trend"
          description="Average turnaround hours by month (collected → resulted)"
          loading={results.isLoading}
          error={results.error}
          onRetry={() => void results.refetch()}
          isEmpty={tatTrend.length === 0}
        >
          <ResultsByMonthChart data={tatTrend} seriesName="Avg TAT (h)" />
        </ChartPanel>

        <ChartPanel
          title="Claim payment lag"
          description="Submitted → paid, bucketed (only settled claims count)"
          loading={claims.isLoading}
          error={claims.error}
          onRetry={() => void claims.refetch()}
          isEmpty={lagHistogram.every((point) => point.count === 0)}
        >
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <Clock className="h-3 w-3" aria-hidden /> hours from submission to payment
          </div>
          <ClaimsByStatusChart data={lagHistogram.map((point) => ({ status: point.bucket, count: point.count }))} />
        </ChartPanel>

        <ChartPanel
          title="Payer mix"
          description="Policies per payer — denominator for contract analytics"
          loading={policies.isLoading}
          error={policies.error}
          onRetry={() => void policies.refetch()}
          isEmpty={payerMixSlices.length === 0}
        >
          <DonutChart data={payerMixSlices} innerRadius={48} />
        </ChartPanel>
      </div>

      {/* --- Batch vs realtime freshness panel ------------------------- */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-1.5">
              <RefreshCw className="h-4 w-4 text-slate-400" aria-hidden /> Batch vs realtime freshness
            </CardTitle>
            <CardDescription>
              Batch tables carry SLA monitors; realtime flows (stream/CDC) are validated by the live
              feed in the top bar.
            </CardDescription>
          </div>
          <Badge variant={freshness.data?.some((entry) => entry.isStale) ? 'danger' : 'success'} dot>
            {freshness.data?.filter((entry) => entry.isStale).length ?? 0} stale
          </Badge>
        </CardHeader>
        <CardContent>
          {freshness.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : freshness.isError ? (
            <ErrorState compact error={freshness.error} onRetry={() => void freshness.refetch()} />
          ) : !freshness.data || freshness.data.length === 0 ? (
            <EmptyState
              title="No freshness monitors"
              description="GET /api/governance/freshness returned no SLA rows."
              icon={RefreshCw}
            />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {freshness.data.map((entry) => {
                const ratio =
                  entry.stalenessMinutes !== null && entry.maxStalenessMinutes > 0
                    ? entry.stalenessMinutes / entry.maxStalenessMinutes
                    : 0;
                return (
                  <div
                    key={entry.tableName}
                    className={`rounded-md border p-3 ${
                      entry.isStale ? 'border-rose-200 bg-rose-50' : ratio >= 0.75 ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-mono text-xs font-medium text-slate-700">{entry.tableName}</p>
                      <Badge
                        variant={entry.isStale ? 'danger' : ratio >= 0.75 ? 'warning' : 'success'}
                      >
                        {entry.isStale ? 'stale' : ratio >= 0.75 ? 'near SLA' : 'fresh'}
                      </Badge>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className={`h-full rounded-full ${entry.isStale ? 'bg-rose-500' : ratio >= 0.75 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                        style={{ width: `${Math.min(Math.round(ratio * 100), 100)}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-[11px] text-slate-500">
                      {entry.stalenessMinutes ?? '—'} min stale / SLA {entry.maxStalenessMinutes} min
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
