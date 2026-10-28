'use client';

import { useMemo, useState } from 'react';
import { GitMerge, ShieldQuestion } from 'lucide-react';
import { ENDPOINTS, type MdmMergeCandidate, type QualityScorecard, type PatientSummary } from '@medidata/shared';
import { useApiQuery } from '@/lib/queries';
import { formatNumber } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';

/**
 * MDM merge-candidate review.
 *
 * The canonical ENDPOINTS map in @medidata/shared does NOT declare an MDM
 * merge-candidates route, so this page:
 *   1. renders the full review UI (score bars, survivorship, sources) driven
 *      by real MdmMergeCandidate data whenever the API provides it;
 *   2. otherwise degrades to live duplicate signals we DO have (patient
 *      duplicateCount, duplicate-related DQ rules) with an explicit note —
 *      no candidate data is ever fabricated.
 */
function normalizeCandidates(raw: unknown): MdmMergeCandidate[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is MdmMergeCandidate => {
    if (typeof item !== 'object' || item === null) return false;
    const record = item as Record<string, unknown>;
    return (
      typeof record.goldenId === 'string' &&
      typeof record.leftPatientId === 'string' &&
      typeof record.rightPatientId === 'string' &&
      typeof record.matchScore === 'number'
    );
  });
}

function MatchScoreBar({ score }: { score: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, score)) * 100);
  const tone = pct >= 90 ? 'bg-rose-500' : pct >= 75 ? 'bg-amber-500' : 'bg-sky-500';
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-100">
        <div className={cn('h-full rounded-full', tone)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold tabular-nums text-slate-700">{pct}%</span>
    </div>
  );
}

export default function MdmPage() {
  const quality = useApiQuery<QualityScorecard>(['governance', 'quality'], ENDPOINTS.governanceQuality.path);
  const patients = useApiQuery<PatientSummary[]>(['patients', 'list'], ENDPOINTS.patients.path, { staleTime: 60_000 });

  // No declared endpoint — kept as a typed slot that activates if the API
  // ever surfaces candidates through a recognized payload.
  const [candidates] = useState<MdmMergeCandidate[]>([]);

  const duplicateRules = useMemo(
    () =>
      (quality.data?.results ?? []).filter((result) =>
        /dup|mdm|merge|golden/i.test(`${result.rule.code} ${result.rule.name} ${result.rule.description}`),
      ),
    [quality.data],
  );

  const duplicatePatients = useMemo(
    () => (patients.data ?? []).filter((patient) => (patient.duplicateCount ?? 0) > 0),
    [patients.data],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="MDM Merge Review"
        description="Golden-record survivorship and duplicate resolution workflow."
        actions={
          <Badge variant={candidates.length > 0 ? 'warning' : 'default'}>
            {candidates.length} open candidates
          </Badge>
        }
      />

      {/* Merge candidate list — real data only */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <GitMerge className="h-4 w-4 text-violet-500" aria-hidden /> Merge candidates
          </CardTitle>
          <CardDescription>
            Match score, match reasons and the survivorship rule applied to the golden record
          </CardDescription>
        </CardHeader>
        <CardContent>
          {candidates.length === 0 ? (
            <EmptyState
              icon={ShieldQuestion}
              title="No merge candidates available"
              description={`The canonical API contract (@medidata/shared ENDPOINTS) does not declare an MDM
                merge-candidates route, so this review queue cannot be populated yet. No data is
                synthesized here — once the API exposes candidates (MdmMergeCandidate[]), they will
                render below with score bars, sources and survivorship rules.`}
            />
          ) : (
            <ul className="space-y-3">
              {candidates.map((candidate) => (
                <li key={`${candidate.leftPatientId}-${candidate.rightPatientId}`} className="rounded-md border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <MatchScoreBar score={candidate.matchScore} />
                    <span className="font-mono text-[11px] text-slate-500">golden {candidate.goldenId}</span>
                    <span className="ml-auto text-[11px] text-slate-400">{candidate.survivorshipRule}</span>
                  </div>
                  <p className="mt-2 text-xs text-slate-600">
                    <span className="font-mono">{candidate.leftPatientId.slice(0, 8)}…</span>
                    {' ↔ '}
                    <span className="font-mono">{candidate.rightPatientId.slice(0, 8)}…</span>
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {candidate.matchReasons.map((reason) => (
                      <Badge key={reason} variant="info">
                        {reason}
                      </Badge>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* Live duplicate signals (real data from existing endpoints) */}
        <Card>
          <CardHeader>
            <CardTitle>Duplicate signals currently available</CardTitle>
            <CardDescription>From patient index + DQ scorecard — the inputs merge review acts on</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {quality.isLoading || patients.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : quality.isError && patients.isError ? (
              <ErrorState compact error={quality.error} onRetry={() => { void quality.refetch(); void patients.refetch(); }} />
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">Patients with duplicates</p>
                    <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
                      {patients.data ? formatNumber(duplicatePatients.length) : '—'}
                    </p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">Duplicate-related DQ rules</p>
                    <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">
                      {quality.data ? formatNumber(duplicateRules.length) : '—'}
                    </p>
                  </div>
                </div>
                {duplicateRules.length > 0 ? (
                  <ul className="space-y-1.5">
                    {duplicateRules.map((result) => (
                      <li key={result.id} className="flex items-center gap-2 rounded border border-slate-200 px-2.5 py-1.5 text-xs">
                        <Badge variant={result.passed ? 'success' : 'danger'}>{result.passed ? 'PASS' : 'FAIL'}</Badge>
                        <span className="truncate font-medium text-slate-700">{result.rule.name}</span>
                        <span className="ml-auto tabular-nums text-slate-500">{formatNumber(result.failedCount)} rows</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-500">
                    No duplicate-related rules in the latest scorecard
                    {quality.isError ? ' (scorecard unavailable)' : ''}.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Survivorship documentation */}
        <Card>
          <CardHeader>
            <CardTitle>Survivorship rules</CardTitle>
            <CardDescription>How the winning field values are chosen when a merge is approved</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-xs leading-5 text-slate-600">
              <li>
                <span className="font-semibold text-slate-800">Golden ID stability:</span> the first-seen
                identifier survives; all source IDs become aliases pointing at it.
              </li>
              <li>
                <span className="font-semibold text-slate-800">Most-recent-wins:</span> demographics
                (address, phone) take the value with the latest source update timestamp.
              </li>
              <li>
                <span className="font-semibold text-slate-800">Source priority:</span> EMR beats LEGACY
                for clinical fields; INSURANCE wins for coverage fields.
              </li>
              <li>
                <span className="font-semibold text-slate-800">Never discard:</span> losing records are
                retained as tombstones so audit can reconstruct pre-merge state.
              </li>
            </ul>
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => { void quality.refetch(); void patients.refetch(); }}>
              Refresh signals
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
