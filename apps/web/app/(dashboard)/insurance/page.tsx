'use client';

import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { CheckCircle2, ClipboardCheck, Search, ShieldCheck, XCircle } from 'lucide-react';
import { ENDPOINTS, type InsurancePolicy } from '@medidata/shared';
import { ApiError, apiFetch } from '@/lib/api';
import { useApiQuery } from '@/lib/queries';
import { formatDate, toKeyValues } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';

const STATUS_VARIANT = { ACTIVE: 'success', INACTIVE: 'default', PENDING: 'warning' } as const;

type EligibilityState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string; offline: boolean }
  | { kind: 'ok'; data: unknown };

export default function InsurancePage() {
  const policies = useApiQuery<InsurancePolicy[]>(['insurance', 'policies'], ENDPOINTS.insurancePolicies.path);
  const [status, setStatus] = useState('ALL');
  const [patientId, setPatientId] = useState('');
  const [eligibility, setEligibility] = useState<EligibilityState>({ kind: 'idle' });

  const rows = useMemo(
    () => (policies.data ?? []).filter((policy) => status === 'ALL' || policy.status === status),
    [policies.data, status],
  );

  const columns = useMemo<ColumnDef<InsurancePolicy>[]>(
    () => [
      { accessorKey: 'payerName', header: 'Payer', cell: ({ getValue }) => <span className="font-medium">{getValue<string>()}</span> },
      { accessorKey: 'payerCode', header: 'Code', cell: ({ getValue }) => <span className="font-mono">{getValue<string>()}</span> },
      { accessorKey: 'memberNumber', header: 'Member #', cell: ({ getValue }) => <span className="font-mono">{getValue<string>()}</span> },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ getValue }) => {
          const value = getValue<string>();
          return <Badge variant={STATUS_VARIANT[value as keyof typeof STATUS_VARIANT] ?? 'default'}>{value}</Badge>;
        },
      },
      { accessorKey: 'effectiveAt', header: 'Effective', cell: ({ getValue }) => formatDate(getValue()) },
      { accessorKey: 'terminatedAt', header: 'Terminated', cell: ({ getValue }) => formatDate(getValue()) },
      {
        id: 'patient',
        header: 'Patient',
        cell: ({ row }) => <span className="font-mono text-[11px]">{row.original.patientId.slice(0, 8)}…</span>,
      },
    ],
    [],
  );

  async function checkEligibility() {
    const id = patientId.trim();
    if (!id) return;
    setEligibility({ kind: 'loading' });
    try {
      const data = await apiFetch<unknown>(
        ENDPOINTS.insuranceEligibility.path.replace(':patientId', encodeURIComponent(id)),
        { silent: true },
      );
      setEligibility({ kind: 'ok', data });
    } catch (error) {
      const apiError = error instanceof ApiError ? error : null;
      setEligibility({
        kind: 'error',
        message: apiError?.message ?? (error instanceof Error ? error.message : 'Unknown error'),
        offline: apiError?.isOffline ?? false,
      });
    }
  }

  const eligibilityRows =
    eligibility.kind === 'ok' ? toKeyValues(eligibility.data) : [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Insurance"
        description="Policy book and real-time eligibility verification."
        actions={<Badge variant="info">{rows.length} policies</Badge>}
      />

      {policies.isError ? <ErrorState error={policies.error} onRetry={() => void policies.refetch()} /> : null}

      {/* --- Eligibility tool -------------------------------------------- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <ClipboardCheck className="h-4 w-4 text-brand-600" aria-hidden /> Eligibility check
          </CardTitle>
          <CardDescription>
            GET {ENDPOINTS.insuranceEligibility.path.replace(':patientId', '<patientId>')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void checkEligibility();
            }}
          >
            <Input
              value={patientId}
              onChange={(event) => setPatientId(event.target.value)}
              placeholder="Patient UUID (e.g. from /patients)"
              aria-label="Patient ID"
              className="max-w-md flex-1 font-mono"
            />
            <Button type="submit" loading={eligibility.kind === 'loading'} disabled={!patientId.trim()}>
              <Search className="h-4 w-4" aria-hidden /> Check eligibility
            </Button>
          </form>

          {eligibility.kind === 'loading' ? <Skeleton className="h-24 w-full" /> : null}

          {eligibility.kind === 'error' ? (
            <ErrorState
              compact
              title={eligibility.offline ? 'API offline — start apps/api' : undefined}
              error={
                eligibility.offline
                  ? new ApiError('NETWORK_ERROR', eligibility.message, 0)
                  : new ApiError('ELIGIBILITY_FAILED', eligibility.message, 400)
              }
              onRetry={() => void checkEligibility()}
            />
          ) : null}

          {eligibility.kind === 'ok' ? (
            eligibilityRows.length === 0 ? (
              <EmptyState title="Empty eligibility response" description="The API returned no fields to display." />
            ) : (
              <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Eligibility response
                </p>
                <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
                  {eligibilityRows.map((entry) => (
                    <div key={entry.key} className="flex justify-between gap-3 text-xs">
                      <dt className="truncate font-mono text-slate-500">{entry.key}</dt>
                      <dd className="truncate font-medium text-slate-700">{entry.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )
          ) : null}
        </CardContent>
      </Card>

      {/* --- Policies table ---------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          aria-label="Filter policies by status"
          className="w-44"
        >
          <option value="ALL">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="PENDING">Pending</option>
        </Select>
        <span className="ml-auto inline-flex items-center gap-1 text-xs text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
          Coverage feeds claim scrubbing
        </span>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        isLoading={policies.isLoading}
        emptyState={
          policies.isError ? undefined : (
            <EmptyState
              icon={XCircle}
              title="No policies match"
              description="Coverage records returned by the API will appear here."
            />
          )
        }
      />
    </div>
  );
}
