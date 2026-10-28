'use client';

import { useMemo } from 'react';
import { GitBranch, PlayCircle, Workflow } from 'lucide-react';
import { ENDPOINTS, type LineageNode, type PipelineRun } from '@medidata/shared';
import { useApiQuery } from '@/lib/queries';
import { formatDateTime, formatNumber, shortId } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';

const RUN_STATUS_VARIANT = {
  QUEUED: 'default',
  RUNNING: 'info',
  SUCCESS: 'success',
  FAILED: 'danger',
} as const;

/**
 * The lineage payload shape is not fixed by a schema — normalize both
 * plausible shapes (bare arrays, or { nodes, runs }) without inventing data.
 */
function normalizeLineage(raw: unknown): { nodes: LineageNode[]; runs: PipelineRun[] } {
  const nodes: LineageNode[] = [];
  const runs: PipelineRun[] = [];
  const pushItem = (item: unknown) => {
    if (typeof item !== 'object' || item === null) return;
    const record = item as Record<string, unknown>;
    if (typeof record.pipelineName === 'string' && 'startedAt' in record) {
      runs.push(record as unknown as PipelineRun);
    } else if (typeof record.node === 'string' && Array.isArray(record.upstream)) {
      nodes.push(record as unknown as LineageNode);
    }
  };

  if (Array.isArray(raw)) {
    raw.forEach(pushItem);
  } else if (typeof raw === 'object' && raw !== null) {
    const record = raw as Record<string, unknown>;
    if (Array.isArray(record.runs)) record.runs.forEach(pushItem);
    if (Array.isArray(record.nodes)) record.nodes.forEach(pushItem);
    if (Array.isArray(record.pipelineRuns)) record.pipelineRuns.forEach(pushItem);
    if (Array.isArray(record.lineage)) record.lineage.forEach(pushItem);
  }
  return { nodes, runs };
}

function duration(run: PipelineRun): string {
  const start = new Date(run.startedAt).getTime();
  const end = run.finishedAt ? new Date(run.finishedAt).getTime() : null;
  if (Number.isNaN(start) || end === null || Number.isNaN(end)) return '—';
  const seconds = Math.round((end - start) / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export default function LineagePage() {
  const query = useApiQuery<unknown>(['governance', 'lineage'], ENDPOINTS.governanceLineage.path);
  const { nodes, runs } = useMemo(() => normalizeLineage(query.data), [query.data]);

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full" />
        <div className="grid gap-4 xl:grid-cols-2">
          <Skeleton className="h-80 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="space-y-4">
        <PageHeader title="Lineage" description="Pipelines, runs and upstream dependencies." />
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Lineage"
        description="Where data comes from, which pipeline moved it, and whether it landed."
        actions={
          <div className="flex gap-1.5">
            <Badge variant="info">{runs.length} runs</Badge>
            <Badge variant="purple">{nodes.length} nodes</Badge>
          </div>
        }
      />

      <div className="grid gap-4 xl:grid-cols-2">
        {/* Pipeline run timeline */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              <PlayCircle className="h-4 w-4 text-brand-600" aria-hidden /> Recent pipeline runs
            </CardTitle>
            <CardDescription>GET {ENDPOINTS.governanceLineage.path} · status, rows in/out, duration</CardDescription>
          </CardHeader>
          <CardContent>
            {runs.length === 0 ? (
              <EmptyState
                icon={Workflow}
                title="No pipeline runs reported"
                description="Runs appear once the worker executes ingestion/transform jobs (or when the API exposes /runs)."
              />
            ) : (
              <ol className="relative space-y-4 border-l border-slate-200 pl-4">
                {runs.map((run) => (
                  <li key={run.id} className="relative">
                    <span
                      className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-white ${
                        run.status === 'SUCCESS'
                          ? 'bg-emerald-500'
                          : run.status === 'FAILED'
                            ? 'bg-rose-500'
                            : run.status === 'RUNNING'
                              ? 'bg-sky-500 animate-pulse'
                              : 'bg-slate-400'
                      }`}
                      aria-hidden
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-slate-800">{run.pipelineName}</p>
                      <Badge variant={RUN_STATUS_VARIANT[run.status] ?? 'default'}>{run.status}</Badge>
                      <span className="ml-auto text-[11px] text-slate-400">{duration(run)}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      started {formatDateTime(run.startedAt)}
                      {run.finishedAt ? ` → finished ${formatDateTime(run.finishedAt)}` : ''}
                    </p>
                    <div className="mt-1 flex gap-3 text-[11px]">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">
                        in {run.rowsIn === null || run.rowsIn === undefined ? '—' : formatNumber(run.rowsIn)}
                      </span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">
                        out {run.rowsOut === null || run.rowsOut === undefined ? '—' : formatNumber(run.rowsOut)}
                      </span>
                      {run.errorMsg ? (
                        <span className="truncate text-rose-600" title={run.errorMsg}>
                          {run.errorMsg}
                        </span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        {/* Lineage graph (list form) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              <GitBranch className="h-4 w-4 text-violet-500" aria-hidden /> Node dependencies
            </CardTitle>
            <CardDescription>Upstream sources feeding each table</CardDescription>
          </CardHeader>
          <CardContent>
            {nodes.length === 0 ? (
              <EmptyState
                icon={GitBranch}
                title="No lineage nodes reported"
                description="The API returned no node graph — worker metadata will populate this list."
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {nodes.map((node) => (
                  <li key={`${node.schemaName}.${node.table}`} className="py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-medium text-slate-800">
                        {node.schemaName}.{node.table}
                      </span>
                      {node.pipeline ? <Badge variant="purple">{node.pipeline}</Badge> : null}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {node.upstream.length === 0 ? (
                        'no upstream (source node)'
                      ) : (
                        <>
                          <span className="text-slate-400">← upstream:</span>{' '}
                          {node.upstream.map((upstream, index) => (
                            <span key={upstream}>
                              <span className="font-mono">{upstream}</span>
                              {index < node.upstream.length - 1 ? ', ' : ''}
                            </span>
                          ))}
                        </>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {nodes.length === 0 && runs.length === 0 && query.data ? (
        <p className="text-center text-xs text-slate-400">
          Raw payload shape not recognized ({shortId(JSON.stringify(query.data).slice(0, 24))}…) —
          nothing was fabricated.
        </p>
      ) : null}
    </div>
  );
}
