'use client';

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Activity, ShieldAlert, ShieldCheck } from 'lucide-react';
import { ENDPOINTS, type QualityScorecard } from '@medidata/shared';
import { useApiQuery } from '@/lib/queries';
import { formatDateTime, formatNumber } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/ui/table';
import type { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartSkeleton } from '@/components/charts/common';

const QualityGauge = dynamic(() => import('@/components/charts/quality-gauge'), {
  ssr: false,
  loading: () => <ChartSkeleton height={200} />,
});

type RuleRow = QualityScorecard['results'][number];

function sampleKeysText(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  try {
    const text = JSON.stringify(value);
    return text.length > 120 ? `${text.slice(0, 117)}…` : text;
  } catch {
    return String(value);
  }
}

export default function QualityPage() {
  const query = useApiQuery<QualityScorecard>(['governance', 'quality'], ENDPOINTS.governanceQuality.path);

  const columns = useMemo<ColumnDef<RuleRow>[]>(
    () => [
      {
        accessorKey: 'rule.code',
        header: 'Rule',
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-900">{row.original.rule.name}</p>
            <p className="font-mono text-[11px] text-slate-400">{row.original.rule.code}</p>
          </div>
        ),
      },
      {
        id: 'target',
        header: 'Target',
        cell: ({ row }) => (
          <span className="font-mono text-[11px] text-slate-600">
            {row.original.rule.targetSchema}.{row.original.rule.targetTable}
          </span>
        ),
      },
      {
        accessorKey: 'rule.severity',
        header: 'Severity',
        cell: ({ getValue }) => {
          const value = getValue<string>();
          return <Badge variant={value === 'CRITICAL' ? 'danger' : 'warning'}>{value}</Badge>;
        },
      },
      {
        id: 'result',
        header: 'Result',
        cell: ({ row }) =>
          row.original.passed ? (
            <Badge variant="success" className="gap-1">
              <ShieldCheck className="h-3 w-3" aria-hidden /> PASS
            </Badge>
          ) : (
            <Badge variant="danger" className="gap-1">
              <ShieldAlert className="h-3 w-3" aria-hidden /> FAIL
            </Badge>
          ),
      },
      {
        accessorKey: 'failedCount',
        header: 'Failed rows',
        cell: ({ getValue }) => (
          <span className="tabular-nums font-medium text-rose-700">{formatNumber(getValue<number>())}</span>
        ),
      },
      {
        accessorKey: 'sampleKeys',
        header: 'Sample keys',
        cell: ({ getValue }) => (
          <span className="block max-w-[16rem] truncate font-mono text-[11px] text-slate-500" title={sampleKeysText(getValue())}>
            {sampleKeysText(getValue())}
          </span>
        ),
      },
      { accessorKey: 'checkedAt', header: 'Checked', cell: ({ getValue }) => formatDateTime(getValue()) },
    ],
    [],
  );

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full" />
        <div className="grid gap-4 xl:grid-cols-3">
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-56 w-full xl:col-span-2" />
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="space-y-4">
        <PageHeader title="Data Quality" description="Rule-engine scorecard." />
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </div>
    );
  }

  const scorecard = query.data;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Data Quality Scorecard"
        description={`Rule results across governed tables — generated ${formatDateTime(scorecard.generatedAt)}`}
        actions={
          <Badge variant={scorecard.criticalFailures > 0 ? 'danger' : 'success'} className="gap-1 px-3 py-1">
            <Activity className="h-3.5 w-3.5" aria-hidden />
            {scorecard.criticalFailures} critical failures
          </Badge>
        }
      />

      <div className="grid gap-4 xl:grid-cols-3">
        {/* Overall gauge */}
        <Card>
          <CardHeader>
            <CardTitle>Overall DQ score</CardTitle>
            <CardDescription>Weighted pass rate across all active rules</CardDescription>
          </CardHeader>
          <CardContent>
            <QualityGauge score={scorecard.overallScore} />
            <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-md bg-emerald-50 p-2">
                <p className="font-semibold tabular-nums text-emerald-700">{scorecard.passedRules}</p>
                <p className="text-[10px] uppercase text-emerald-600">passed</p>
              </div>
              <div className="rounded-md bg-rose-50 p-2">
                <p className="font-semibold tabular-nums text-rose-700">{scorecard.failedRules}</p>
                <p className="text-[10px] uppercase text-rose-600">failed</p>
              </div>
              <div className="rounded-md bg-slate-100 p-2">
                <p className="font-semibold tabular-nums text-slate-700">{scorecard.totalRules}</p>
                <p className="text-[10px] uppercase text-slate-500">total</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Failure breakdown */}
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Gate impact</CardTitle>
            <CardDescription>How failing rules block downstream consumption</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5 text-sm text-slate-600">
            <p className="leading-6">
              Rules marked <span className="font-semibold text-rose-700">CRITICAL</span> gate the ML
              feature pipeline: while critical failures persist, risk scoring returns{' '}
              <span className="font-mono text-xs">DQ_GATE_FAILED</span> instead of a score — the
              Patient&nbsp;360 risk card surfaces this state explicitly.
            </p>
            <ul className="space-y-1.5">
              {scorecard.results
                .filter((result) => !result.passed)
                .slice(0, 5)
                .map((result) => (
                  <li key={result.id} className="flex items-center gap-2 rounded-md border border-rose-100 bg-rose-50/60 px-2.5 py-1.5 text-xs">
                    <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-rose-500" aria-hidden />
                    <span className="font-medium text-rose-800">{result.rule.name}</span>
                    <span className="font-mono text-rose-500">{result.rule.code}</span>
                    <span className="ml-auto tabular-nums text-rose-700">{formatNumber(result.failedCount)} rows</span>
                  </li>
                ))}
            </ul>
            {scorecard.failedRules === 0 ? (
              <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                <ShieldCheck className="h-4 w-4" aria-hidden /> All rules passing — no gates blocked.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Per-rule results */}
      <DataTable
        columns={columns}
        data={scorecard.results}
        initialPageSize={15}
        emptyState={<EmptyState icon={Activity} title="No rule results" description="Run the DQ engine to populate this scorecard." />}
      />
    </div>
  );
}
