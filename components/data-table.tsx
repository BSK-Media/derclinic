"use client";

import * as React from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { Input } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export function DataTable<TData>({
  data,
  columns,
  searchPlaceholder = "Szukaj…",
}: {
  data: TData[];
  columns: ColumnDef<TData, any>[];
  searchPlaceholder?: string;
}) {
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [sorting, setSorting] = React.useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    state: { globalFilter, sorting },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    globalFilterFn: "includesString",
  });

  return (
    <div className="space-y-3">
      <Input value={globalFilter ?? ""} onChange={(e) => setGlobalFilter(e.target.value)} placeholder={searchPlaceholder} />

      <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <Table>
          <THead>
            {table.getHeaderGroups().map((hg) => (
              <TR key={hg.id}>
                {hg.headers.map((h) => (
                  <TH
                    key={h.id}
                    className={cn(h.column.getCanSort() && "cursor-pointer select-none")}
                    onClick={h.column.getToggleSortingHandler()}
                    title="Sortuj"
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {{
                      asc: " ↑",
                      desc: " ↓",
                    }[h.column.getIsSorted() as string] ?? ""}
                  </TH>
                ))}
              </TR>
            ))}
          </THead>
          <TBody>
            {table.getRowModel().rows.length === 0 ? (
              <TR>
                <TD colSpan={columns.length} className="py-6 text-center text-zinc-500">
                  Brak danych
                </TD>
              </TR>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TR key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TD key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TD>
                  ))}
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </div>
    </div>
  );
}
