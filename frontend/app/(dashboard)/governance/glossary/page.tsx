'use client';

import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { BookOpen, Search } from 'lucide-react';
import { ENDPOINTS, type GlossaryTerm } from '@medidata/shared';
import { useApiQuery } from '@/lib/queries';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';

export default function GlossaryPage() {
  const glossary = useApiQuery<GlossaryTerm[]>(['governance', 'glossary'], ENDPOINTS.governanceGlossary.path);
  const [search, setSearch] = useState('');

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const all = glossary.data ?? [];
    if (!needle) return all;
    return all.filter((term) =>
      `${term.term} ${term.definition} ${term.domain}`.toLowerCase().includes(needle),
    );
  }, [glossary.data, search]);

  const domains = useMemo(
    () => Array.from(new Set((glossary.data ?? []).map((term) => term.domain))).sort(),
    [glossary.data],
  );

  const columns = useMemo<ColumnDef<GlossaryTerm>[]>(
    () => [
      {
        accessorKey: 'term',
        header: 'Term',
        cell: ({ getValue }) => <span className="font-semibold text-slate-900">{getValue<string>()}</span>,
      },
      {
        accessorKey: 'definition',
        header: 'Definition',
        cell: ({ getValue }) => <span className="text-slate-600">{getValue<string>()}</span>,
      },
      { accessorKey: 'domain', header: 'Domain', cell: ({ getValue }) => <Badge variant="info">{getValue<string>()}</Badge> },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Business Glossary"
        description="Shared definitions so dashboards and pipelines speak the same language."
        actions={<Badge variant="info">{glossary.data?.length ?? 0} terms · {domains.length} domains</Badge>}
      />

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search term, definition or domain…"
          className="pl-8"
          aria-label="Search glossary"
        />
      </div>

      {glossary.isError ? (
        <ErrorState error={glossary.error} onRetry={() => void glossary.refetch()} />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          isLoading={glossary.isLoading}
          emptyState={
            <EmptyState
              icon={BookOpen}
              title={search ? 'No terms match' : 'Glossary empty'}
              description={search ? 'Clear the search to browse everything.' : 'Curated business terms will appear here.'}
            />
          }
        />
      )}
    </div>
  );
}
