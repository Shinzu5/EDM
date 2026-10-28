'use client';

import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { History, Search } from 'lucide-react';
import { ENDPOINTS, type AuditLogEntry } from '@medidata/shared';
import { useApiQuery } from '@/lib/queries';
import { formatDateTime, shortId } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { AuthGuard } from '@/components/AuthGuard';
import { DataTable } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';

const KNOWN_ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'RELEASE', 'MERGE', 'EXPORT'] as const;

function AuditContent() {
  const query = useApiQuery<AuditLogEntry[]>(['governance', 'audit'], ENDPOINTS.governanceAudit.path, {
    staleTime: 15_000,
  });
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('ALL');

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (query.data ?? []).filter((entry) => {
      if (action !== 'ALL' && entry.action !== action) return false;
      if (!needle) return true;
      return `${entry.action} ${entry.entityType} ${entry.entityId} ${entry.actorRole}`
        .toLowerCase()
        .includes(needle);
    });
  }, [query.data, search, action]);

  const columns = useMemo<ColumnDef<AuditLogEntry>[]>(
    () => [
      { accessorKey: 'createdAt', header: 'Timestamp', cell: ({ getValue }) => <span className="whitespace-nowrap tabular-nums">{formatDateTime(getValue())}</span> },
      {
        accessorKey: 'actorRole',
        header: 'Actor role',
        cell: ({ getValue }) => <Badge variant="outline">{getValue<string>()}</Badge>,
      },
      {
        accessorKey: 'actorUserId',
        header: 'Actor',
        cell: ({ getValue }) => {
          const id = getValue<string | null | undefined>();
          return id ? <span className="font-mono text-[11px]">{shortId(id)}</span> : <span className="text-slate-400">system</span>;
        },
      },
      {
        accessorKey: 'action',
        header: 'Action',
        cell: ({ getValue }) => {
          const value = getValue<string>();
          const danger = ['DELETE', 'EXPORT', 'MERGE'].includes(value);
          return <Badge variant={danger ? 'warning' : 'info'}>{value}</Badge>;
        },
      },
      { accessorKey: 'entityType', header: 'Entity', cell: ({ getValue }) => <span className="font-medium">{getValue<string>()}</span> },
      { accessorKey: 'entityId', header: 'Entity ID', cell: ({ getValue }) => <span className="font-mono text-[11px]">{shortId(getValue())}</span> },
      {
        accessorKey: 'ipAddress',
        header: 'Source',
        cell: ({ row }) => (
          <span className="font-mono text-[11px] text-slate-500">
            {row.original.ipAddress ?? '—'}
          </span>
        ),
      },
    ],
    [],
  );

  const actions = useMemo(() => {
    const set = new Set((query.data ?? []).map((entry) => entry.action));
    return Array.from(set).sort();
  }, [query.data]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Audit Trail"
        description="Immutable log of every access and mutation — readable by AUDITOR and ADMIN."
        actions={<Badge variant="info">{rows.length} / {query.data?.length ?? 0} entries</Badge>}
      />

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search action, entity or actor…"
            className="pl-8"
            aria-label="Search audit log"
          />
        </div>
        <Select value={action} onChange={(event) => setAction(event.target.value)} aria-label="Filter by action" className="w-44">
          <option value="ALL">All actions</option>
          {(actions.length > 0 ? actions : [...KNOWN_ACTIONS]).map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </Select>
      </div>

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          isLoading={query.isLoading}
          initialSorting={[{ id: 'createdAt', desc: true }]}
          initialPageSize={15}
          emptyState={
            <EmptyState
              icon={History}
              title={query.data?.length === 0 ? 'No audit entries yet' : 'No entries match the filters'}
              description="Audit events appear as soon as users and pipelines start writing."
            />
          }
        />
      )}
    </div>
  );
}

/** Route guard: AUDITOR + ADMIN only (also enforced by the API). */
export default function AuditPage() {
  return (
    <AuthGuard action="read" subject="audit">
      <AuditContent />
    </AuthGuard>
  );
}
