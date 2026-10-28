'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { FlaskConical, Gavel, ShieldCheck } from 'lucide-react';
import {
  ENDPOINTS,
  type LabOrder,
  type LabResult,
} from '@medidata/shared';
import { ApiError, apiFetch } from '@/lib/api';
import { useApiQuery } from '@/lib/queries';
import { useAbility } from '@/lib/auth';
import { useToast } from '@/components/ui/toast';
import { hoursBetween, formatDateTime, shortId } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/ui/table';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/cn';

const RESULT_STATUSES = ['COLLECTED', 'IN_PROGRESS', 'REVIEWED', 'RELEASED', 'CORRECTED'] as const;
const ORDER_STATUSES = ['QUEUED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;

const RESULT_STATUS_VARIANT: Record<string, 'default' | 'info' | 'warning' | 'success' | 'purple'> = {
  COLLECTED: 'default',
  IN_PROGRESS: 'info',
  REVIEWED: 'warning',
  RELEASED: 'success',
  CORRECTED: 'purple',
};

/** TAT thresholds (hours): ≤4 green, ≤12 amber, beyond red. */
function tatTone(hours: number): string {
  if (hours <= 4) return 'text-emerald-600';
  if (hours <= 12) return 'text-amber-600';
  return 'text-rose-600';
}

function TatCell({ start, end }: { start: unknown; end: unknown }) {
  const hours = hoursBetween(start, end);
  if (hours === null) return <span className="text-slate-400">—</span>;
  return (
    <span className={cn('font-medium tabular-nums', tatTone(hours))}>
      {hours.toFixed(1)} h
    </span>
  );
}

export default function LabsPage() {
  const { can } = useAbility();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const orders = useApiQuery<LabOrder[]>(['labs', 'orders'], ENDPOINTS.labOrders.path);
  const results = useApiQuery<LabResult[]>(['labs', 'results'], ENDPOINTS.labResults.path);

  const [statusFilter, setStatusFilter] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [releaseTarget, setReleaseTarget] = useState<LabResult | null>(null);

  /** Results carry testCode only — resolve human names through their orders. */
  const orderNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const order of orders.data ?? []) map.set(order.id, order.testName);
    return map;
  }, [orders.data]);

  const canReview = can('review', 'labs');
  const canRelease = can('release', 'labs');

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['labs'] });
    void queryClient.invalidateQueries({ queryKey: ['kpis'] });
  };

  const reviewMutation = useMutation({
    mutationFn: (resultId: string) =>
      apiFetch<void>(ENDPOINTS.labResultReview.path.replace(':id', resultId), { method: 'POST', body: {} }),
    onSuccess: () => {
      toast({ title: 'Result reviewed', description: 'Status advanced to REVIEWED.', variant: 'success' });
      invalidate();
    },
    onError: (error: ApiError) =>
      toast({ title: error.code, description: error.message, variant: 'error' }),
  });

  const releaseMutation = useMutation({
    mutationFn: (resultId: string) =>
      apiFetch<void>(ENDPOINTS.labResultRelease.path.replace(':id', resultId), { method: 'POST', body: {} }),
    onSuccess: () => {
      toast({ title: 'Result released', description: 'Released to the patient portal.', variant: 'success' });
      setReleaseTarget(null);
      invalidate();
    },
    onError: (error: ApiError) =>
      toast({ title: error.code, description: error.message, variant: 'error' }),
  });

  const filteredResults = useMemo(() => {
    const rows = results.data ?? [];
    return rows.filter((result) => {
      if (statusFilter !== 'ALL' && result.status !== statusFilter) return false;
      if (dateFrom) {
        const stamp = new Date(result.collectedAt).getTime();
        if (Number.isNaN(stamp) || stamp < new Date(dateFrom).getTime()) return false;
      }
      return true;
    });
  }, [results.data, statusFilter, dateFrom]);

  /** Review queue: anything not yet released/corrected awaits action. */
  const queue = useMemo(
    () => (results.data ?? []).filter((result) => ['COLLECTED', 'IN_PROGRESS', 'REVIEWED'].includes(result.status)),
    [results.data],
  );

  const resultColumns = useMemo<ColumnDef<LabResult>[]>(
    () => [
      {
        id: 'test',
        header: 'Test',
        cell: ({ row }) => (
          <span className="font-medium">{orderNames.get(row.original.orderId) || row.original.testCode}</span>
        ),
      },
      { accessorKey: 'testCode', header: 'Code', cell: ({ getValue }) => <span className="font-mono">{getValue<string>()}</span> },
      {
        id: 'patient',
        header: 'Patient',
        cell: ({ row }) => <span className="font-mono text-[11px]">{shortId(row.original.patientId)}</span>,
      },
      {
        id: 'value',
        header: 'Value',
        cell: ({ row }) => (
          <span className="tabular-nums">
            {row.original.valueNumeric ?? row.original.valueText ?? '—'}
            {row.original.unit ? ` ${row.original.unit}` : ''}
          </span>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ getValue }) => <Badge variant={RESULT_STATUS_VARIANT[getValue<string>()] ?? 'default'}>{getValue<string>()}</Badge>,
      },
      { accessorKey: 'collectedAt', header: 'Collected', cell: ({ getValue }) => formatDateTime(getValue()) },
      { accessorKey: 'resultedAt', header: 'Resulted', cell: ({ getValue }) => formatDateTime(getValue()) },
      {
        id: 'tat',
        header: 'TAT',
        cell: ({ row }) => <TatCell start={row.original.collectedAt} end={row.original.resultedAt ?? row.original.reviewedAt} />,
      },
    ],
    [orderNames],
  );

  const orderColumns = useMemo<ColumnDef<LabOrder>[]>(
    () => [
      { accessorKey: 'testName', header: 'Order', cell: ({ getValue }) => <span className="font-medium">{getValue<string>()}</span> },
      { accessorKey: 'testCode', header: 'Code', cell: ({ getValue }) => <span className="font-mono">{getValue<string>()}</span> },
      { accessorKey: 'orderedAt', header: 'Ordered', cell: ({ getValue }) => formatDateTime(getValue()) },
      { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => <Badge variant="outline">{getValue<string>()}</Badge> },
      {
        id: 'patient',
        header: 'Patient',
        cell: ({ row }) => <span className="font-mono text-[11px]">{shortId(row.original.patientId)}</span>,
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Laboratory"
        description="Orders, results, TAT monitoring and the release review queue (ISO 15189)."
        actions={<Badge variant="info">{queue.length} in queue</Badge>}
      />

      {orders.isError || results.isError ? (
        <ErrorState error={orders.error ?? results.error} onRetry={() => { void orders.refetch(); void results.refetch(); }} />
      ) : null}

      {/* --- Review queue --------------------------------------------- */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-1.5">
              <FlaskConical className="h-4 w-4 text-brand-600" aria-hidden /> Review queue
            </CardTitle>
            <CardDescription>
              {canRelease
                ? 'Your role may authorize final release under ISO 15189 §7.2.2.'
                : 'Review is allowed for your role; final release requires a physician or admin (ISO 15189 §7.2.2).'}
            </CardDescription>
          </div>
          {!canReview && !canRelease ? <Badge variant="warning">Read-only role</Badge> : null}
        </CardHeader>
        <CardContent>
          {results.isLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-8 animate-pulse rounded bg-slate-100" />)}</div>
          ) : results.isError ? (
            <ErrorState compact error={results.error} onRetry={() => void results.refetch()} />
          ) : queue.length === 0 ? (
            <EmptyState
              title="Queue clear — nothing awaiting action"
              description="New results appear here as soon as the LIS files them."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {queue.map((result) => (
                <li key={result.id} className="flex flex-wrap items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {orderNames.get(result.orderId) || result.testCode}
                    </p>
                    <p className="font-mono text-[11px] text-slate-400">
                      {shortId(result.id)} · patient {shortId(result.patientId)} · collected{' '}
                      {formatDateTime(result.collectedAt)}
                    </p>
                  </div>
                  <Badge variant={RESULT_STATUS_VARIANT[result.status] ?? 'default'}>{result.status}</Badge>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!canReview || result.status === 'REVIEWED' || reviewMutation.isPending}
                      loading={reviewMutation.isPending && reviewMutation.variables === result.id}
                      onClick={() => reviewMutation.mutate(result.id)}
                    >
                      Review
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={!canRelease || result.status !== 'REVIEWED' || releaseMutation.isPending}
                      onClick={() => setReleaseTarget(result)}
                    >
                      <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Release
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* --- Filters --------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          aria-label="Filter results by status"
          className="w-48"
        >
          <option value="ALL">All result statuses</option>
          {RESULT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </Select>
        <Input
          type="date"
          value={dateFrom}
          onChange={(event) => setDateFrom(event.target.value)}
          aria-label="Results collected on/after"
          className="w-44"
        />
        {(statusFilter !== 'ALL' || dateFrom) ? (
          <Button size="sm" variant="ghost" onClick={() => { setStatusFilter('ALL'); setDateFrom(''); }}>
            Clear filters
          </Button>
        ) : null}
        <span className="ml-auto text-xs text-slate-500">{filteredResults.length} results</span>
      </div>

      {/* --- Results table --------------------------------------------- */}
      <DataTable
        columns={resultColumns}
        data={filteredResults}
        isLoading={results.isLoading}
        emptyState={<EmptyState title="No results match the filters" description="Try clearing status/date filters." />}
      />

      {/* --- Orders table ---------------------------------------------- */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Orders</h2>
        <DataTable
          columns={orderColumns}
          data={orders.data ?? []}
          isLoading={orders.isLoading}
          emptyState={<EmptyState title="No orders" description="Lab orders from the EMR will appear here." />}
        />
      </div>

      {/* --- Release confirmation (ISO 15189) --------------------------- */}
      <Dialog
        open={releaseTarget !== null}
        onOpenChange={(open) => {
          if (!open) setReleaseTarget(null);
        }}
        title="Authorize result release"
        description="ISO 15189 §7.2.2 — authorized personnel only"
        footer={
          <>
            <Button variant="secondary" onClick={() => setReleaseTarget(null)}>
              Cancel
            </Button>
            <Button
              loading={releaseMutation.isPending}
              onClick={() => {
                if (releaseTarget) releaseMutation.mutate(releaseTarget.id);
              }}
            >
              <Gavel className="h-4 w-4" aria-hidden /> Confirm release
            </Button>
          </>
        }
      >
        {releaseTarget ? (
          <div className="space-y-3 text-sm">
            <p className="leading-6 text-slate-600">
              You are authorizing release of the following result to the patient record and portal.
              This action is written to the immutable audit trail with your user and role:
            </p>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
              <p className="font-medium text-slate-800">
                {orderNames.get(releaseTarget.orderId) || releaseTarget.testCode}
              </p>
              <p className="mt-1 font-mono text-slate-500">
                {releaseTarget.valueNumeric ?? releaseTarget.valueText ?? '—'} {releaseTarget.unit} ·
                ref {releaseTarget.referenceRange}
              </p>
              <p className="mt-1 font-mono text-slate-500">result id {releaseTarget.id}</p>
            </div>
            <p className="text-xs text-slate-500">
              Released results cannot be unsent — corrections are issued as CORRECTED results.
            </p>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
