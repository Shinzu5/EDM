'use client';

import { useMemo, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import { TableSkeleton } from '@/components/ui/skeleton';

export type DataTableProps<TData, TValue> = {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  isLoading?: boolean;
  /** Rendered instead of the default empty message. */
  emptyState?: React.ReactNode;
  onRowClick?: (row: TData) => void;
  initialSorting?: SortingState;
  initialPageSize?: number;
  /** Hide pagination entirely (small fixed lists). */
  pagination?: boolean;
  className?: string;
};

/**
 * TanStack Table v8 wrapper: sorting, client-side pagination, loading
 * skeleton and a proper empty state — the single table used app-wide.
 */
export function DataTable<TData, TValue>({
  columns,
  data,
  isLoading,
  emptyState,
  onRowClick,
  initialSorting = [],
  initialPageSize = 10,
  pagination = true,
  className,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const memoData = useMemo(() => data, [data]);
  const memoColumns = useMemo(() => columns, [columns]);

  const table = useReactTable({
    data: memoData,
    columns: memoColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    ...(pagination ? { getPaginationRowModel: getPaginationRowModel() } : {}),
    initialState: { pagination: { pageSize } },
  });

  if (isLoading) {
    return (
      <div className={cn('overflow-hidden rounded-lg border border-slate-200 bg-white', className)}>
        <TableSkeleton cols={Math.max(columns.length, 4)} />
      </div>
    );
  }

  const rowCount = table.getRowModel().rows.length;

  return (
    <div className={cn('overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm', className)}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="bg-slate-50">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      className="whitespace-nowrap border-b border-slate-200 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500"
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1 hover:text-slate-800"
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {sorted === 'asc' ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : sorted === 'desc' ? (
                            <ArrowDown className="h-3 w-3" />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-40" />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {rowCount === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-0">
                  {emptyState ?? <EmptyState title="No records found" description="Nothing matches the current filters." />}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={cn(
                    'border-b border-slate-100 text-slate-700 last:border-b-0 hover:bg-slate-50',
                    onRowClick && 'cursor-pointer',
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2 align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {pagination ? (
        <Pagination
          page={table.getState().pagination.pageIndex}
          pageCount={table.getPageCount()}
          pageSize={table.getState().pagination.pageSize}
          total={table.getPrePaginationRowModel().rows.length}
          onPageChange={table.setPageIndex}
          onPageSizeChange={(size) => {
            setPageSize(size);
            table.setPageSize(size);
          }}
        />
      ) : null}
    </div>
  );
}
