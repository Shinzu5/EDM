'use client';

import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Database, Search } from 'lucide-react';
import type { z } from 'zod';
import { ENDPOINTS, ClassificationSchema, type CatalogEntry, type User } from '@medidata/shared';
import { useApiQuery } from '@/lib/queries';
import { formatNumber } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';

/** shared exports ClassificationSchema but no inferred type — derive it. */
type Classification = z.infer<typeof ClassificationSchema>;

const CLASSIFICATION_VARIANT: Record<Classification, 'success' | 'info' | 'warning' | 'danger'> = {
  PUBLIC: 'success',
  INTERNAL: 'info',
  PII: 'warning',
  PHI: 'danger',
};

export default function CatalogPage() {
  const catalog = useApiQuery<CatalogEntry[]>(['governance', 'catalog'], ENDPOINTS.governanceCatalog.path);
  const users = useApiQuery<User[]>(['admin', 'users'], ENDPOINTS.adminUsers.path, { staleTime: 120_000 });
  const [search, setSearch] = useState('');

  const stewardNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const user of users.data ?? []) map.set(user.id, user.fullName);
    return map;
  }, [users.data]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const all = catalog.data ?? [];
    if (!needle) return all;
    return all.filter((entry) =>
      `${entry.schemaName}.${entry.tableName} ${entry.description} ${entry.classification}`
        .toLowerCase()
        .includes(needle),
    );
  }, [catalog.data, search]);

  const columns = useMemo<ColumnDef<CatalogEntry>[]>(
    () => [
      {
        id: 'asset',
        header: 'Asset',
        cell: ({ row }) => (
          <span className="font-mono text-xs font-medium text-slate-800">
            {row.original.schemaName}.{row.original.tableName}
          </span>
        ),
      },
      {
        accessorKey: 'description',
        header: 'Description',
        cell: ({ getValue }) => <span className="line-clamp-2 text-slate-600">{getValue<string>() || '—'}</span>,
      },
      {
        accessorKey: 'stewardUserId',
        header: 'Steward',
        cell: ({ getValue }) => {
          const id = getValue<string | null | undefined>();
          if (!id) return <span className="text-slate-400">—</span>;
          return stewardNames.get(id) ?? <span className="font-mono text-[11px]">{id.slice(0, 8)}…</span>;
        },
      },
      {
        accessorKey: 'classification',
        header: 'Classification',
        cell: ({ getValue }) => {
          const value = getValue<Classification>();
          return <Badge variant={CLASSIFICATION_VARIANT[value] ?? 'default'}>{value}</Badge>;
        },
      },
      {
        accessorKey: 'containsPhi',
        header: 'PHI',
        cell: ({ getValue }) =>
          getValue<boolean>() ? (
            <Badge variant="danger">PHI</Badge>
          ) : (
            <span className="text-slate-400">no</span>
          ),
      },
      {
        accessorKey: 'retentionDays',
        header: 'Retention',
        cell: ({ getValue }) => {
          const days = getValue<number | null | undefined>();
          return (
            <span className="tabular-nums">{days === null || days === undefined ? '—' : `${formatNumber(days)} d`}</span>
          );
        },
      },
    ],
    [stewardNames],
  );

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of catalog.data ?? []) map.set(entry.classification, (map.get(entry.classification) ?? 0) + 1);
    return map;
  }, [catalog.data]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Data Catalog"
        description="Governed assets with stewards, classification and retention policy."
        actions={
          <div className="flex flex-wrap gap-1.5">
            {Array.from(counts.entries()).map(([label, count]) => (
              <Badge key={label} variant={CLASSIFICATION_VARIANT[label as Classification] ?? 'default'}>
                {label} · {count}
              </Badge>
            ))}
          </div>
        }
      />

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search schema, table or description…"
          className="pl-8"
          aria-label="Search catalog"
        />
      </div>

      {catalog.isError ? (
        <ErrorState error={catalog.error} onRetry={() => void catalog.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          isLoading={catalog.isLoading}
          emptyState={
            <EmptyState
              icon={Database}
              title={search ? 'No assets match the search' : 'Catalog empty'}
              description={
                search
                  ? 'Try a different schema or table name.'
                  : 'Curated data assets will appear here once the API is seeded.'
              }
            />
          }
        />
      )}
      {users.isError ? (
        <p className="text-[11px] text-slate-400">
          Steward names unavailable ({users.error.code}) — IDs shown instead.
        </p>
      ) : null}
    </div>
  );
}
