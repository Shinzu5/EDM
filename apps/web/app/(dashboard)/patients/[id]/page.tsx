'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertTriangle,
  ArrowLeft,
  BrainCircuit,
  ShieldCheck,
} from 'lucide-react';
import {
  ENDPOINTS,
  type AuditLogEntry,
  type Claim,
  type Encounter,
  type LabResult,
  type Patient360,
  type RiskScore,
} from '@medidata/shared';
import { ApiError } from '@/lib/api';
import { useApiQuery } from '@/lib/queries';
import { formatDateTime, formatDate, formatMoney, formatNumber, shortId, hoursBetween } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs } from '@/components/ui/tabs';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartSkeleton } from '@/components/charts/common';

const RiskFactorsChart = dynamic(() => import('@/components/charts/risk-factors'), {
  ssr: false,
  loading: () => <ChartSkeleton height={180} />,
});

const RESULT_STATUS_VARIANT: Record<string, 'default' | 'info' | 'warning' | 'success' | 'purple'> = {
  COLLECTED: 'default',
  IN_PROGRESS: 'info',
  REVIEWED: 'warning',
  RELEASED: 'success',
  CORRECTED: 'purple',
};

const CLAIM_STATUS_VARIANT: Record<string, 'default' | 'info' | 'warning' | 'success' | 'danger' | 'purple'> = {
  DRAFT: 'default',
  SUBMITTED: 'info',
  PENDING: 'warning',
  PAID: 'success',
  DENIED: 'danger',
  APPEALED: 'purple',
};

function RiskCard({ patientId }: { patientId: string }) {
  const query = useApiQuery<RiskScore>(['ml', 'risk', patientId], ENDPOINTS.mlRisk.path.replace(':patientId', patientId));

  const dqBlocked = query.isError && query.error instanceof ApiError && query.error.code === 'DQ_GATE_FAILED';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <BrainCircuit className="h-4 w-4 text-violet-500" aria-hidden /> ML risk score
        </CardTitle>
        <CardDescription>
          GET {ENDPOINTS.mlRisk.path.replace(':patientId', '<patientId>')} · model-gated on data quality
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {dqBlocked ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
            <div className="text-xs">
              <p className="font-semibold text-amber-800">Risk scoring blocked — DQ gate failed</p>
              <p className="mt-0.5 leading-5 text-amber-700">
                The feature pipeline refused to score this patient because required data-quality
                checks failed (code <span className="font-mono">DQ_GATE_FAILED</span>). Predictions
                are withheld rather than served on untrusted inputs.
              </p>
            </div>
          </div>
        ) : query.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : query.isError ? (
          <ErrorState compact error={query.error} onRetry={() => void query.refetch()} />
        ) : query.data ? (
          <>
            <div className="flex items-center gap-4">
              <div>
                <p className="text-3xl font-semibold tabular-nums text-slate-900">
                  {query.data.riskScore.toFixed(2)}
                </p>
                <p className="text-[11px] uppercase tracking-wide text-slate-500">risk score</p>
              </div>
              <Badge
                variant={query.data.riskBand === 'HIGH' ? 'danger' : query.data.riskBand === 'MEDIUM' ? 'warning' : 'success'}
                className="px-3 py-1 text-sm"
              >
                {query.data.riskBand}
              </Badge>
              <div className="ml-auto text-right text-[11px] text-slate-500">
                <p className="font-mono">{query.data.modelVersion}</p>
                <p>{formatDateTime(query.data.generatedAt)}</p>
              </div>
            </div>
            <RiskFactorsChart data={query.data.topFactors.map((f) => ({ name: f.factor, value: Math.round(f.contribution * 1000) / 10 }))} />
          </>
        ) : (
          <EmptyState title="No risk score" description="The model has not scored this patient yet." />
        )}
      </CardContent>
    </Card>
  );
}

export default function Patient360Page() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [tab, setTab] = useState('encounters');

  const query = useApiQuery<Patient360>(['patients', '360', id], ENDPOINTS.patient360.path.replace(':id', id), {
    enabled: Boolean(id),
  });
  const audit = useApiQuery<AuditLogEntry[]>(['governance', 'audit'], ENDPOINTS.governanceAudit.path, {
    enabled: tab === 'audit',
    staleTime: 15_000,
  });

  const patient = query.data?.patient;
  const auditRows = useMemo(
    () => (audit.data ?? []).filter((entry) => entry.entityId === id),
    [audit.data, id],
  );

  const encounterColumns = useMemo<ColumnDef<Encounter>[]>(
    () => [
      { accessorKey: 'type', header: 'Type', cell: ({ getValue }) => <Badge variant="info">{getValue<string>()}</Badge> },
      { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => <Badge variant="outline">{getValue<string>()}</Badge> },
      { accessorKey: 'admittedAt', header: 'Admitted', cell: ({ getValue }) => formatDateTime(getValue()) },
      { accessorKey: 'dischargedAt', header: 'Discharged', cell: ({ getValue }) => formatDateTime(getValue()) },
      {
        accessorKey: 'diagnosisCode',
        header: 'Diagnosis',
        cell: ({ row }) => (
          <span>
            <span className="font-mono text-[11px] text-slate-500">{row.original.diagnosisCode}</span>{' '}
            {row.original.diagnosisText}
          </span>
        ),
      },
    ],
    [],
  );

  const labColumns = useMemo<ColumnDef<LabResult>[]>(
    () => [
      { accessorKey: 'testName', header: 'Test', cell: ({ getValue }) => <span className="font-medium">{getValue<string>() || '—'}</span> },
      { accessorKey: 'testCode', header: 'Code', cell: ({ getValue }) => <span className="font-mono">{getValue<string>()}</span> },
      {
        id: 'value',
        header: 'Value',
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.valueNumeric ?? row.original.valueText ?? '—'}
            {row.original.unit ? ` ${row.original.unit}` : ''}
            {row.original.abnormalFlag ? (
              <Badge variant="danger" className="ml-1.5">
                {row.original.abnormalFlag}
              </Badge>
            ) : null}
          </span>
        ),
      },
      { accessorKey: 'referenceRange', header: 'Ref. range' },
      {
        id: 'tat',
        header: 'TAT (h)',
        cell: ({ row }) => {
          const hours = hoursBetween(row.original.collectedAt, row.original.resultedAt);
          return <span className="tabular-nums">{hours === null ? '—' : hours.toFixed(1)}</span>;
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ getValue }) => <Badge variant={RESULT_STATUS_VARIANT[getValue<string>()] ?? 'default'}>{getValue<string>()}</Badge>,
      },
    ],
    [],
  );

  const claimColumns = useMemo<ColumnDef<Claim>[]>(
    () => [
      { accessorKey: 'claimNumber', header: 'Claim #', cell: ({ getValue }) => <span className="font-mono">{getValue<string>()}</span> },
      { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => <Badge variant={CLAIM_STATUS_VARIANT[getValue<string>()] ?? 'default'}>{getValue<string>()}</Badge> },
      { accessorKey: 'billedAmount', header: 'Billed', cell: ({ getValue }) => <span className="tabular-nums">{formatMoney(getValue())}</span> },
      { accessorKey: 'paidAmount', header: 'Paid', cell: ({ getValue }) => <span className="tabular-nums">{formatMoney(getValue() ?? 0)}</span> },
      { accessorKey: 'submittedAt', header: 'Submitted', cell: ({ getValue }) => formatDate(getValue()) },
      { accessorKey: 'paidAt', header: 'Paid at', cell: ({ getValue }) => formatDate(getValue()) },
    ],
    [],
  );

  const auditColumns = useMemo<ColumnDef<AuditLogEntry>[]>(
    () => [
      { accessorKey: 'createdAt', header: 'When', cell: ({ getValue }) => formatDateTime(getValue()) },
      { accessorKey: 'actorRole', header: 'Actor', cell: ({ getValue }) => <Badge variant="outline">{getValue<string>()}</Badge> },
      { accessorKey: 'action', header: 'Action', cell: ({ getValue }) => <span className="font-medium">{getValue<string>()}</span> },
      { accessorKey: 'entityType', header: 'Entity' },
      { accessorKey: 'entityId', header: 'Entity ID', cell: ({ getValue }) => <span className="font-mono">{shortId(getValue())}</span> },
      {
        accessorKey: 'ipAddress',
        header: 'IP',
        cell: ({ getValue }) => <span className="font-mono text-[11px]">{getValue<string | null | undefined>() ?? '—'}</span>,
      },
    ],
    [],
  );

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-8 w-96" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Patient 360 unavailable" />;
  }

  const activeConsents = query.data.consents.filter((consent) => consent.granted);
  const encounterTab = (
    <DataTable columns={encounterColumns} data={query.data.encounters} isLoading={query.isLoading} />
  );

  return (
    <div className="space-y-4">
      <div>
        <button
          type="button"
          onClick={() => window.history.back()}
          className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to patients
        </button>
        <PageHeader
          title={patient?.fullNameNormalized ?? 'Patient'}
          description={`MRN ${patient?.mrn ?? '—'} · ${formatDate(patient?.dateOfBirth)} · ${patient?.sex ?? '—'} · ${patient?.city ?? '—'}`}
          actions={
            <Badge variant="success" className="gap-1 px-3 py-1">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              {activeConsents.length > 0
                ? `Consent: ${activeConsents.map((c) => c.consentType).join(', ')}`
                : 'No active consent'}
            </Badge>
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Demographics header card */}
        <Card>
          <CardHeader>
            <CardTitle>Demographics</CardTitle>
            <CardDescription>Masked values reflect your role&apos;s data access</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
              {[
                ['Full name', patient?.fullNameNormalized],
                ['MRN', patient?.mrn],
                ['DOB', formatDate(patient?.dateOfBirth)],
                ['Sex', patient?.sex],
                ['Phone', patient?.phone],
                ['Email', patient?.email],
                ['City', patient?.city],
                ['Address', patient?.address],
                ['Source system', patient?.sourceSystem],
                ['Created', patient ? formatDateTime(patient.createdAt) : undefined],
              ].map(([label, value], index) => (
                <div key={`${label}-${index}`}>
                  <dt className="text-[10px] uppercase tracking-wide text-slate-400">{label as string}</dt>
                  <dd className="truncate font-medium text-slate-700">{(value as string | null | undefined) ?? '—'}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <div className="xl:col-span-2">
          <RiskCard patientId={id} />
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        value={tab}
        onValueChange={setTab}
        items={[
          { id: 'encounters', label: 'Encounters', badge: <Badge variant="default">{query.data.encounters.length}</Badge> },
          { id: 'labs', label: 'Lab results', badge: <Badge variant="default">{query.data.labResults.length}</Badge> },
          { id: 'claims', label: 'Claims & insurance', badge: <Badge variant="default">{query.data.claims.length}</Badge> },
          { id: 'audit', label: 'Audit trail' },
        ]}
      />

      <div className="pt-1">
        {tab === 'encounters' ? (
          query.data.encounters.length === 0 ? (
            <EmptyState title="No encounters" description="This patient has no recorded encounters." />
          ) : (
            encounterTab
          )
        ) : null}

        {tab === 'labs' ? (
          <DataTable
            columns={labColumns}
            data={query.data.labResults}
            emptyState={<EmptyState title="No lab results" description="No results have been filed for this patient." />}
          />
        ) : null}

        {tab === 'claims' ? (
          <div className="space-y-4">
            <DataTable
              columns={claimColumns}
              data={query.data.claims}
              emptyState={<EmptyState title="No claims" description="No claims are linked to this patient." />}
            />
            <Card>
              <CardHeader>
                <CardTitle>Coverage</CardTitle>
              </CardHeader>
              <CardContent>
                {query.data.insurance.length === 0 ? (
                  <EmptyState title="No policies on file" />
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {query.data.insurance.map((policy) => (
                      <div key={policy.id} className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate font-semibold text-slate-800">{policy.payerName}</p>
                          <Badge variant={policy.status === 'ACTIVE' ? 'success' : policy.status === 'PENDING' ? 'warning' : 'default'}>
                            {policy.status}
                          </Badge>
                        </div>
                        <p className="mt-1 font-mono text-[11px] text-slate-500">{policy.memberNumber}</p>
                        <p className="mt-1 text-[11px] text-slate-500">
                          {formatDate(policy.effectiveAt)} → {policy.terminatedAt ? formatDate(policy.terminatedAt) : 'open'}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        ) : null}

        {tab === 'audit' ? (
          audit.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : audit.isError ? (
            <ErrorState error={audit.error} onRetry={() => void audit.refetch()} />
          ) : (
            <DataTable
              columns={auditColumns}
              data={auditRows}
              emptyState={
                <EmptyState
                  title="No audit entries for this patient"
                  description={`Checked ${formatDateTime(new Date())} — events appear after writes occur.`}
                />
              }
            />
          )
        ) : null}
      </div>

      {/* Consent summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-emerald-500" aria-hidden /> Consents
            <span className="text-slate-400">({formatNumber(query.data.consents.length)})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {query.data.consents.length === 0 ? (
            <EmptyState title="No consent records" description="Consent capture events will appear here." />
          ) : (
            <div className="flex flex-wrap gap-2">
              {query.data.consents.map((consent) => (
                <Badge key={consent.id} variant={consent.granted ? 'success' : 'danger'}>
                  {consent.consentType} · {consent.granted ? 'granted' : 'revoked'}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
