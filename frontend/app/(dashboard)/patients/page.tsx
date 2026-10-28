'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ColumnDef } from '@tanstack/react-table';
import { Search, Users } from 'lucide-react';
import { ENDPOINTS, type PatientSummary } from '@medidata/shared';
import { useApiQuery } from '@/lib/queries';
import { formatDate, formatDateTime, formatNumber, shortId } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';

const SEX_VARIANTS: Record<string, 'info' | 'purple' | 'default'> = {
  MALE: 'info',
  FEMALE: 'purple',
  OTHER: 'default',
  UNKNOWN: 'default',
};

export default function PatientsPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [sex, setSex] = useState('ALL');
  const [city, setCity] = useState('ALL');

  const query = useApiQuery<PatientSummary[]>(['patients', 'list'], ENDPOINTS.patients.path);

  const rows = useMemo(() => {
    const all = query.data ?? [];
    const needle = search.trim().toLowerCase();
    return all.filter((patient) => {
      if (sex !== 'ALL' && patient.sex !== sex) return false;
      if (city !== 'ALL' && (patient.city ?? '') !== city) return false;
      if (!needle) return true;
      // Search across name/MRN/city — masked values are simply matched as-is,
      // exactly what the API returned for this role.
      return [patient.fullNameNormalized, patient.firstName, patient.lastName, patient.mrn, patient.city ?? '']
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [query.data, search, sex, city]);

  const cities = useMemo(
    () => Array.from(new Set((query.data ?? []).map((p) => p.city).filter((c): c is string => Boolean(c)))).sort(),
    [query.data],
  );

  const columns = useMemo<ColumnDef<PatientSummary>[]>(
    () => [
      {
        accessorKey: 'fullNameNormalized',
        header: 'Patient',
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-900">{row.original.fullNameNormalized}</p>
            <p className="font-mono text-[11px] text-slate-400">{shortId(row.original.id)}</p>
          </div>
        ),
      },
      { accessorKey: 'mrn', header: 'MRN', cell: ({ getValue }) => <span className="font-mono">{getValue<string>()}</span> },
      { accessorKey: 'dateOfBirth', header: 'DOB', cell: ({ getValue }) => formatDate(getValue()) },
      {
        accessorKey: 'sex',
        header: 'Sex',
        cell: ({ getValue }) => <Badge variant={SEX_VARIANTS[getValue<string>()] ?? 'default'}>{getValue<string>()}</Badge>,
      },
      { accessorKey: 'city', header: 'City', cell: ({ getValue }) => getValue() || '—' },
      {
        accessorKey: 'encounterCount',
        header: 'Encounters',
        cell: ({ getValue }) => <span className="tabular-nums">{formatNumber(getValue<number>())}</span>,
      },
      {
        accessorKey: 'lastEncounterAt',
        header: 'Last visit',
        cell: ({ getValue }) => formatDateTime(getValue()),
      },
      {
        accessorKey: 'sourceSystem',
        header: 'Source',
        cell: ({ getValue }) => <Badge variant="outline">{getValue<string>()}</Badge>,
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Patients"
        description="Master patient index — values are masked per your role by the API."
        actions={<Badge variant="info">{rows.length} of {query.data?.length ?? 0}</Badge>}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, MRN or city…"
            className="pl-8"
            aria-label="Search patients"
          />
        </div>
        <Select value={sex} onChange={(event) => setSex(event.target.value)} aria-label="Filter by sex" className="w-36">
          <option value="ALL">All sexes</option>
          <option value="MALE">Male</option>
          <option value="FEMALE">Female</option>
          <option value="OTHER">Other</option>
          <option value="UNKNOWN">Unknown</option>
        </Select>
        <Select value={city} onChange={(event) => setCity(event.target.value)} aria-label="Filter by city" className="w-40">
          <option value="ALL">All cities</option>
          {cities.map((value) => (
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
          onRowClick={(patient) => router.push(`/patients/${patient.id}`)}
          initialSorting={[{ id: 'fullNameNormalized', desc: false }]}
          emptyState={
            <EmptyState
              icon={Users}
              title={search || sex !== 'ALL' || city !== 'ALL' ? 'No patients match the filters' : 'No patients yet'}
              description={
                search || sex !== 'ALL' || city !== 'ALL'
                  ? 'Adjust the search or clear the filters.'
                  : 'Once the API is seeded, patient records will appear here.'
              }
            />
          }
        />
      )}
    </div>
  );
}
