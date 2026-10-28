'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import type { ColumnDef } from '@tanstack/react-table';
import { Ban, Receipt, TrendingDown, Wallet } from 'lucide-react';
import { ENDPOINTS, type Claim, type InsurancePolicy } from '@medidata/shared';
import { useApiQuery } from '@/lib/queries';
import { formatDate, formatMoney, shortId } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/ui/table';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { ChartSkeleton } from '@/components/charts/common';

const ClaimsByStatusChart = dynamic(() => import('@/components/charts/claims-by-status'), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});

const CLAIM_STATUSES = ['DRAFT', 'SUBMITTED', 'PENDING', 'PAID', 'DENIED', 'APPEALED'] as const;

const CLAIM_STATUS_VARIANT: Record<string, 'default' | 'info' | 'warning' | 'success' | 'danger' | 'purple'> = {
  DRAFT: 'default',
  SUBMITTED: 'info',
  PENDING: 'warning',
  PAID: 'success',
  DENIED: 'danger',
  APPEALED: 'purple',
};

/** Invoices have no canonical schema — normalize defensively, never invent. */
type InvoiceRow = { id: string; status: string; amount: number | null; issuedAt: unknown };

function normalizeInvoices(raw: unknown): InvoiceRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item, index) => {
      const record = item as Record<string, unknown>;
      const amountCandidate = ['amount', 'totalAmount', 'invoiceAmount', 'billedAmount', 'total']
        .map((key) => record[key])
        .find((value) => typeof value === 'number');
      const statusCandidate = ['status', 'state'].map((key) => record[key]).find((value) => typeof value === 'string');
      const issuedCandidate = ['issuedAt', 'createdAt', 'invoiceDate', 'date'].map((key) => record[key]).find(Boolean);
      const idCandidate = ['id', 'invoiceNumber', 'number'].map((key) => record[key]).find((value) => typeof value === 'string');
      return {
        id: typeof idCandidate === 'string' ? idCandidate : `row-${index}`,
        status: typeof statusCandidate === 'string' ? statusCandidate : '—',
        amount: typeof amountCandidate === 'number' ? amountCandidate : null,
        issuedAt: issuedCandidate ?? null,
      };
    });
}

export default function BillingPage() {
  const claims = useApiQuery<Claim[]>(['billing', 'claims'], ENDPOINTS.claims.path);
  const invoices = useApiQuery<unknown>(['billing', 'invoices'], ENDPOINTS.invoices.path);
  const policies = useApiQuery<InsurancePolicy[]>(['insurance', 'policies'], ENDPOINTS.insurancePolicies.path, {
    staleTime: 60_000,
  });

  const [status, setStatus] = useState('ALL');
  const [payerId, setPayerId] = useState('ALL');

  const payerNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const policy of policies.data ?? []) map.set(policy.payerId, policy.payerName);
    return map;
  }, [policies.data]);

  const rows = useMemo(
    () =>
      (claims.data ?? []).filter((claim) => {
        if (status !== 'ALL' && claim.status !== status) return false;
        if (payerId !== 'ALL' && claim.payerId !== payerId) return false;
        return true;
      }),
    [claims.data, status, payerId],
  );

  const payerOptions = useMemo(() => {
    const ids = new Set((claims.data ?? []).map((claim) => claim.payerId));
    return Array.from(ids).sort();
  }, [claims.data]);

  const totals = useMemo(() => {
    const list = claims.data ?? [];
    const billed = list.reduce((sum, claim) => sum + claim.billedAmount, 0);
    const paid = list.reduce((sum, claim) => sum + (claim.paidAmount ?? 0), 0);
    const denied = list.filter((claim) => claim.status === 'DENIED');
    return {
      billed,
      paid,
      outstanding: Math.max(billed - paid, 0),
      denied,
      deniedAmount: denied.reduce((sum, claim) => sum + claim.billedAmount, 0),
    };
  }, [claims.data]);

  const invoiceRows = useMemo(() => normalizeInvoices(invoices.data), [invoices.data]);
  const invoiceTotals = useMemo(() => {
    const amounts = invoiceRows.map((row) => row.amount).filter((value): value is number => value !== null);
    return { count: invoiceRows.length, total: amounts.reduce((sum, value) => sum + value, 0) };
  }, [invoiceRows]);

  const claimColumns = useMemo<ColumnDef<Claim>[]>(
    () => [
      { accessorKey: 'claimNumber', header: 'Claim #', cell: ({ getValue }) => <span className="font-mono">{getValue<string>()}</span> },
      { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => <Badge variant={CLAIM_STATUS_VARIANT[getValue<string>()] ?? 'default'}>{getValue<string>()}</Badge> },
      {
        id: 'payer',
        header: 'Payer',
        cell: ({ row }) => payerNames.get(row.original.payerId) ?? <span className="font-mono text-[11px]">{shortId(row.original.payerId)}</span>,
      },
      {
        id: 'patient',
        header: 'Patient',
        cell: ({ row }) => <span className="font-mono text-[11px]">{shortId(row.original.patientId)}</span>,
      },
      { accessorKey: 'billedAmount', header: 'Billed', cell: ({ getValue }) => <span className="tabular-nums">{formatMoney(getValue())}</span> },
      { accessorKey: 'paidAmount', header: 'Paid', cell: ({ getValue }) => <span className="tabular-nums text-emerald-700">{formatMoney(getValue() ?? 0)}</span> },
      { accessorKey: 'submittedAt', header: 'Submitted', cell: ({ getValue }) => formatDate(getValue()) },
      { accessorKey: 'paidAt', header: 'Paid', cell: ({ getValue }) => formatDate(getValue()) },
    ],
    [payerNames],
  );

  const invoiceColumns = useMemo<ColumnDef<InvoiceRow>[]>(
    () => [
      { accessorKey: 'id', header: 'Invoice', cell: ({ getValue }) => <span className="font-mono">{shortId(getValue())}</span> },
      { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => <Badge variant="outline">{getValue<string>()}</Badge> },
      {
        accessorKey: 'amount',
        header: 'Amount',
        cell: ({ getValue }) => <span className="tabular-nums">{formatMoney(getValue())}</span>,
      },
      { accessorKey: 'issuedAt', header: 'Issued', cell: ({ getValue }) => formatDate(getValue()) },
    ],
    [],
  );

  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const claim of claims.data ?? []) counts.set(claim.status, (counts.get(claim.status) ?? 0) + 1);
    return Array.from(counts.entries()).map(([name, count]) => ({ name, count }));
  }, [claims.data]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Billing"
        description="Claims lifecycle, invoices and denial management."
        actions={<Badge variant="info">{rows.length} claims shown</Badge>}
      />

      {claims.isError ? <ErrorState error={claims.error} onRetry={() => void claims.refetch()} /> : null}

      {/* --- Summary cards --------------------------------------------- */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total billed" icon={Receipt} tone="brand" value={formatMoney(totals.billed)} hint="All claims, all payers" />
        <StatCard label="Collected" icon={Wallet} tone="success" value={formatMoney(totals.paid)} hint="Paid amounts posted" />
        <StatCard label="Outstanding" icon={TrendingDown} tone="warning" value={formatMoney(totals.outstanding)} hint="Billed minus collected" />
        <StatCard
          label="Denied claims"
          icon={Ban}
          tone="danger"
          value={formatMoney(totals.deniedAmount)}
          hint={`${totals.denied.length} denied · needs appeal`}
        />
      </div>

      {/* --- Denied callout --------------------------------------------- */}
      {totals.denied.length > 0 ? (
        <Card className="border-rose-200 bg-rose-50/60">
          <CardHeader className="border-rose-100">
            <CardTitle className="flex items-center gap-1.5 text-rose-800">
              <Ban className="h-4 w-4" aria-hidden /> {totals.denied.length} denied claims require attention
            </CardTitle>
            <CardDescription className="text-rose-600">
              {formatMoney(totals.deniedAmount)} withheld — file appeals before the payer deadline.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
              {totals.denied.slice(0, 9).map((claim) => (
                <li key={claim.id} className="flex items-center justify-between gap-2 rounded border border-rose-200 bg-white px-2.5 py-1.5 text-xs">
                  <span className="font-mono">{claim.claimNumber}</span>
                  <span className="tabular-nums text-slate-600">{formatMoney(claim.billedAmount)}</span>
                  <span className="text-slate-400">{payerNames.get(claim.payerId) ?? shortId(claim.payerId)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {/* --- Chart + invoice cards -------------------------------------- */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Claims by status</CardTitle>
            <CardDescription>Live distribution across the revenue cycle</CardDescription>
          </CardHeader>
          <CardContent>
            {claims.isLoading ? (
              <ChartSkeleton />
            ) : claims.isError ? (
              <ErrorState compact error={claims.error} onRetry={() => void claims.refetch()} />
            ) : statusCounts.length === 0 ? (
              <EmptyState title="No claims yet" icon={Receipt} />
            ) : (
              <ClaimsByStatusChart data={statusCounts.map((entry) => ({ status: entry.name, count: entry.count }))} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Invoice summary</CardTitle>
            <CardDescription>GET {ENDPOINTS.invoices.path}</CardDescription>
          </CardHeader>
          <CardContent>
            {invoices.isLoading ? (
              <ChartSkeleton height={200} />
            ) : invoices.isError ? (
              <ErrorState compact error={invoices.error} onRetry={() => void invoices.refetch()} />
            ) : invoiceRows.length === 0 ? (
              <EmptyState
                title="No invoices"
                description="The API returned no invoice documents (or a shape without rows)."
                icon={Receipt}
              />
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Invoices</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{invoiceTotals.count}</p>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Invoiced total</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{formatMoney(invoiceTotals.total)}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* --- Filters ----------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter claims by status" className="w-48">
          <option value="ALL">All claim statuses</option>
          {CLAIM_STATUSES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </Select>
        <Select value={payerId} onChange={(event) => setPayerId(event.target.value)} aria-label="Filter claims by payer" className="w-56">
          <option value="ALL">All payers</option>
          {payerOptions.map((id) => (
            <option key={id} value={id}>
              {payerNames.get(id) ?? shortId(id)}
            </option>
          ))}
        </Select>
      </div>

      {/* --- Claims table ------------------------------------------------ */}
      <DataTable
        columns={claimColumns}
        data={rows}
        isLoading={claims.isLoading}
        initialSorting={[{ id: 'submittedAt', desc: true }]}
        emptyState={<EmptyState title="No claims match the filters" description="Clear filters to see the full book." icon={Receipt} />}
      />

      {/* --- Invoice table ----------------------------------------------- */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Invoices</h2>
        <DataTable
          columns={invoiceColumns}
          data={invoiceRows}
          isLoading={invoices.isLoading}
          emptyState={<EmptyState title="No invoices returned by the API" icon={Receipt} />}
        />
      </div>
    </div>
  );
}
