'use client';

import { useMemo } from 'react';
import { AlertOctagon, RefreshCw, Timer } from 'lucide-react';
import { ENDPOINTS, type FreshnessStatus } from '@medidata/shared';
import { useApiQuery } from '@/lib/queries';
import { formatDateTime, formatNumber } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';

type Tone = 'success' | 'warning' | 'danger';

function toneFor(entry: FreshnessStatus): Tone {
  if (entry.isStale) return 'danger';
  if (entry.stalenessMinutes !== null && entry.maxStalenessMinutes > 0) {
    if (entry.stalenessMinutes / entry.maxStalenessMinutes >= 0.75) return 'warning';
  }
  return 'success';
}

const TONE_LABEL: Record<Tone, string> = { success: 'OK', warning: 'Near SLA', danger: 'BREACH' };
const TONE_BADGE = { success: 'success', warning: 'warning', danger: 'danger' } as const;
const TONE_BAR = {
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-rose-500',
} as const;

export default function FreshnessPage() {
  const query = useApiQuery<FreshnessStatus[]>(['governance', 'freshness'], ENDPOINTS.governanceFreshness.path);

  const summary = useMemo(() => {
    const list = query.data ?? [];
    return {
      total: list.length,
      breaches: list.filter((entry) => entry.isStale).length,
      near: list.filter((entry) => toneFor(entry) === 'warning').length,
      ok: list.filter((entry) => toneFor(entry) === 'success').length,
    };
  }, [query.data]);

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="space-y-4">
        <PageHeader title="Freshness SLA" description="Batch load staleness vs thresholds." />
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Freshness SLA"
        description="Every batch table's staleness against its configured SLA threshold."
        actions={
          <div className="flex gap-1.5">
            <Badge variant="success">{summary.ok} OK</Badge>
            <Badge variant="warning">{summary.near} near</Badge>
            <Badge variant="danger" className="gap-1">
              {summary.breaches > 0 ? <AlertOctagon className="h-3 w-3" aria-hidden /> : null}
              {summary.breaches} breach
            </Badge>
          </div>
        }
      />

      {!query.data || query.data.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={Timer}
              title="No freshness monitors"
              description="GET /api/governance/freshness returned no rows — SLA monitors appear once tables are registered."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {query.data.map((entry) => {
            const tone = toneFor(entry);
            const ratio =
              entry.stalenessMinutes !== null && entry.maxStalenessMinutes > 0
                ? Math.min(entry.stalenessMinutes / entry.maxStalenessMinutes, 1)
                : 0;
            return (
              <Card
                key={entry.tableName}
                className={cn(tone === 'danger' && 'border-rose-300 ring-1 ring-rose-200', tone === 'warning' && 'border-amber-200')}
              >
                <CardContent>
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-mono text-xs font-semibold text-slate-800">{entry.tableName}</p>
                    <Badge variant={TONE_BADGE[tone]} dot>
                      {TONE_LABEL[tone]}
                    </Badge>
                  </div>

                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className={cn('h-full rounded-full', TONE_BAR[tone])} style={{ width: `${Math.round(ratio * 100)}%` }} />
                  </div>

                  <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
                    <div>
                      <dt className="text-slate-400">Stale</dt>
                      <dd className="font-semibold tabular-nums text-slate-700">
                        {entry.stalenessMinutes === null ? '—' : formatNumber(entry.stalenessMinutes)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">SLA</dt>
                      <dd className="font-semibold tabular-nums text-slate-700">{formatNumber(entry.maxStalenessMinutes)}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Used</dt>
                      <dd className="font-semibold tabular-nums text-slate-700">
                        {Math.round(ratio * 100)}%
                      </dd>
                    </div>
                  </dl>

                  <p className="mt-2 flex items-center gap-1 text-[11px] text-slate-500">
                    <RefreshCw className="h-3 w-3" aria-hidden />
                    last loaded {formatDateTime(entry.lastLoadedAt)}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
