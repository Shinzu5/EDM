'use client';

import dynamic from 'next/dynamic';
import { format, subMonths } from 'date-fns';
import {
  AlertOctagon,
  CheckCircle2,
  Database,
  FlaskConical,
  Hourglass,
  Merge,
  Users,
  Wallet,
} from 'lucide-react';
import {
  ENDPOINTS,
  type FreshnessStatus,
  type LabResult,
  type OutcomeKpis,
  type PatientSummary,
  type Claim,
  type QualityScorecard,
} from '@medidata/shared';
import { useApiQuery } from '@/lib/queries';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { Badge } from '@/components/ui/badge';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { formatNumber, formatPercent, toDate } from '@/lib/format';
import { ChartSkeleton } from '@/components/charts/common';

const ResultsByMonthChart = dynamic(() => import('@/components/charts/results-by-month'), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});
const ClaimsByStatusChart = dynamic(() => import('@/components/charts/claims-by-status'), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});

const PENDING_RESULT_STATUSES = new Set(['COLLECTED', 'IN_PROGRESS', 'REVIEWED']);
const OPEN_CLAIM_STATUSES = new Set(['DRAFT', 'SUBMITTED', 'PENDING']);

function monthBuckets(results: LabResult[]): Array<{ month: string; count: number }> {
  const buckets = new Map<string, number>();
  const start = subMonths(new Date(), 11);
  for (let i = 11; i >= 0; i -= 1) {
    buckets.set(format(subMonths(new Date(), i), 'yyyy-MM'), 0);
  }
  for (const result of results) {
    const date = toDate(result.resultedAt) ?? toDate(result.collectedAt);
    if (!date || date < start) continue;
    const key = format(date, 'yyyy-MM');
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return Array.from(buckets.entries()).map(([month, count]) => ({ month, count }));
}

function claimStatusCounts(claims: Claim[]): Array<{ status: string; count: number }> {
  const counts = new Map<string, number>();
  for (const claim of claims) {
    counts.set(claim.status, (counts.get(claim.status) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => a.status.localeCompare(b.status));
}

function freshnessTone(entry: FreshnessStatus): 'success' | 'warning' | 'danger' {
  if (entry.isStale) return 'danger';
  const max = entry.maxStalenessMinutes;
  const staleness = entry.stalenessMinutes;
  if (staleness !== null && max > 0 && staleness / max >= 0.75) return 'warning';
  return 'success';
}

const FRESHNESS_LABEL = { success: 'OK', warning: 'Warn', danger: 'Breach' } as const;

export default function OverviewPage() {
  const patients = useApiQuery<PatientSummary[]>(['patients', 'list'], ENDPOINTS.patients.path);
  const results = useApiQuery<LabResult[]>(['labs', 'results'], ENDPOINTS.labResults.path);
  const claims = useApiQuery<Claim[]>(['billing', 'claims'], ENDPOINTS.claims.path);
  const quality = useApiQuery<QualityScorecard>(['governance', 'quality'], ENDPOINTS.governanceQuality.path);
  const outcomes = useApiQuery<OutcomeKpis>(['kpis', 'outcomes'], ENDPOINTS.kpisOutcomes.path);
  const freshness = useApiQuery<FreshnessStatus[]>(['governance', 'freshness'], ENDPOINTS.governanceFreshness.path);

  const loading = patients.isLoading || results.isLoading || claims.isLoading;
  const retryAll = () => {
    void patients.refetch();
    void results.refetch();
    void claims.refetch();
    void quality.refetch();
    void outcomes.refetch();
    void freshness.refetch();
  };

  const pendingResults = results.data?.filter((r) => PENDING_RESULT_STATUSES.has(r.status)).length ?? null;
  const openClaims = claims.data?.filter((c) => OPEN_CLAIM_STATUSES.has(c.status)).length ?? null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="KPI Overview"
        description="Platform-wide clinical, revenue and data-quality health."
      />

      {/* --- Stat cards ------------------------------------------------- */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {loading ? (
          Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-[92px] w-full" />
          ))
        ) : (
          <>
            <StatCard
              label="Patients"
              icon={Users}
              tone="brand"
              value={patients.isError ? '—' : formatNumber(patients.data?.length ?? 0)}
              hint={patients.isError ? 'Unavailable' : 'Golden records in MDM'}
            />
            <StatCard
              label="Results pending review"
              icon={Hourglass}
              tone="warning"
              value={results.isError ? '—' : formatNumber(pendingResults ?? 0)}
              hint="Collected / in progress / reviewed"
            />
            <StatCard
              label="Open claims"
              icon={Wallet}
              tone="purple"
              value={claims.isError ? '—' : formatNumber(openClaims ?? 0)}
              hint="Draft / submitted / pending"
            />
            <StatCard
              label="DQ score"
              icon={quality.data?.criticalFailures ? AlertOctagon : CheckCircle2}
              tone={quality.data && quality.data.criticalFailures > 0 ? 'danger' : 'success'}
              value={quality.isError ? '—' : formatPercent(quality.data?.overallScore ?? null, 0)}
              hint={
                quality.data
                  ? `${quality.data.passedRules}/${quality.data.totalRules} rules passing`
                  : 'Awaiting scorecard'
              }
            />
            <StatCard
              label="Duplicate rate (after MDM)"
              icon={Merge}
              tone="success"
              value={outcomes.isError ? '—' : formatPercent(outcomes.data?.duplicateRateAfter ?? null, 2)}
              hint={
                outcomes.data
                  ? `was ${formatPercent(outcomes.data.duplicateRateBefore, 2)} before MDM`
                  : 'Awaiting outcome KPIs'
              }
            />
          </>
        )}
      </div>

      {(patients.isError || results.isError || claims.isError) && (
        <ErrorState error={patients.error ?? results.error ?? claims.error} onRetry={retryAll} />
      )}

      {/* --- Charts ----------------------------------------------------- */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Results by month</CardTitle>
            <CardDescription>Laboratory results resulted in the last 12 months</CardDescription>
          </CardHeader>
          <CardContent>
            {results.isLoading ? (
              <ChartSkeleton />
            ) : results.isError ? (
              <ErrorState compact error={results.error} onRetry={() => void results.refetch()} />
            ) : (results.data?.length ?? 0) === 0 ? (
              <EmptyState title="No results yet" description="Released lab results will trend here." icon={FlaskConical} />
            ) : (
              <ResultsByMonthChart data={monthBuckets(results.data ?? [])} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Claims by status</CardTitle>
            <CardDescription>Revenue-cycle distribution across the claims lifecycle</CardDescription>
          </CardHeader>
          <CardContent>
            {claims.isLoading ? (
              <ChartSkeleton />
            ) : claims.isError ? (
              <ErrorState compact error={claims.error} onRetry={() => void claims.refetch()} />
            ) : (claims.data?.length ?? 0) === 0 ? (
              <EmptyState title="No claims" description="Claims submitted to payers will appear here." icon={Wallet} />
            ) : (
              <ClaimsByStatusChart data={claimStatusCounts(claims.data ?? [])} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* --- Freshness SLA strip ---------------------------------------- */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-1.5">
              <Database className="h-4 w-4 text-slate-400" aria-hidden /> Freshness SLA strip
            </CardTitle>
            <CardDescription>Batch table staleness vs configured SLA thresholds</CardDescription>
          </div>
          <Badge variant={freshness.data?.some((f) => f.isStale) ? 'danger' : 'success'} dot>
            {freshness.data?.filter((f) => f.isStale).length ?? 0} breached
          </Badge>
        </CardHeader>
        <CardContent>
          {freshness.isLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : freshness.isError ? (
            <ErrorState compact error={freshness.error} onRetry={() => void freshness.refetch()} />
          ) : !freshness.data || freshness.data.length === 0 ? (
            <EmptyState title="No freshness monitors" description="Pipeline SLA monitors will be listed here." />
          ) : (
            <div className="flex flex-wrap gap-2">
              {freshness.data.map((entry) => {
                const tone = freshnessTone(entry);
                return (
                  <span
                    key={entry.tableName}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                    title={`SLA ${entry.maxStalenessMinutes} min · staleness ${entry.stalenessMinutes ?? '—'} min`}
                  >
                    <span
                      className={
                        tone === 'success'
                          ? 'h-1.5 w-1.5 rounded-full bg-emerald-500'
                          : tone === 'warning'
                            ? 'h-1.5 w-1.5 rounded-full bg-amber-500'
                            : 'h-1.5 w-1.5 rounded-full bg-rose-500'
                      }
                      aria-hidden
                    />
                    <span className="font-mono text-[11px] text-slate-700">{entry.tableName}</span>
                    <Badge
                      variant={tone === 'success' ? 'success' : tone === 'warning' ? 'warning' : 'danger'}
                    >
                      {FRESHNESS_LABEL[tone]}
                    </Badge>
                  </span>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
