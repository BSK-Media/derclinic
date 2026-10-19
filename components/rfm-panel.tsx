"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { formatPLNFromGrosze } from "@/lib/money";
import type { RfmSegment } from "@/lib/rfm";

const fetcher = (url: string) => fetch(url).then((response) => response.json());

type SegmentRow = { segment: RfmSegment; label: string; hint: string; count: number; monetary: number };
type PatientRow = {
  id: string;
  name: string;
  r: number;
  f: number;
  m: number;
  daysSince: number;
  frequency: number;
  monetary: number;
};

export const SEGMENT_TONE: Record<RfmSegment, string> = {
  VIP: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  LOYAL: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  NEW: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  WIN_BACK: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  AT_RISK: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  DORMANT: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  OTHER: "bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400",
};

const currentPageFrom = (page: number, size: number) => (page - 1) * size + 1;

export function RfmPanel() {
  const [segment, setSegment] = React.useState<RfmSegment>("VIP");
  type SortKey = "name" | "rfm" | "daysSince" | "frequency" | "monetary";
  const [sort, setSort] = React.useState<SortKey>("monetary");
  const [dir, setDir] = React.useState<"asc" | "desc">("desc");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(50);

  function changeSegment(next: RfmSegment) {
    setSegment(next);
    setPage(1);
  }
  function changeSort(key: SortKey) {
    setPage(1);
    if (key === sort) setDir((current) => (current === "desc" ? "asc" : "desc"));
    else {
      setSort(key);
      // Nazwa i „ostatnio (dni)” domyślnie rosnąco, reszta malejąco.
      setDir(key === "name" || key === "daysSince" ? "asc" : "desc");
    }
  }
  const arrow = (key: SortKey) => (sort === key ? (dir === "desc" ? " ↓" : " ↑") : " ↕");

  const { data, isLoading } = useSWR(
    `/api/admin/analytics/rfm?segment=${segment}&sort=${sort}&dir=${dir}&page=${page}&pageSize=${pageSize}`,
    fetcher,
    { keepPreviousData: true },
  );
  const segments: SegmentRow[] = data?.segments ?? [];
  const patients: PatientRow[] = data?.patients ?? [];
  const active = segments.find((s) => s.segment === segment);

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">Segmentacja pacjentów (RFM)</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Oceny 1–5: świeżość (R), częstotliwość (F) i wartość (M). Częstotliwość i wartość liczone{" "}
          {data?.windowDays ? `z ostatnich ${data.windowDays} dni` : "z całej historii pacjenta"}; liczone zakończone, zaakceptowane wizyty i sprzedaż przypisana do pacjenta.
        </p>
      </div>

      {isLoading ? (
        <Card className="text-sm text-zinc-500">Ładowanie…</Card>
      ) : data?.ok === false || !segments.length ? (
        <Card className="text-sm text-zinc-500">Brak danych do analizy.</Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {segments.map((s) => (
              <button
                key={s.segment}
                type="button"
                onClick={() => changeSegment(s.segment)}
                className={
                  "rounded-xl border p-3 text-left transition " +
                  (segment === s.segment
                    ? "border-indigo-500 ring-1 ring-indigo-500"
                    : "border-zinc-200 hover:border-zinc-400 dark:border-zinc-800")
                }
              >
                <span className={"inline-block rounded-full px-2 py-0.5 text-xs font-semibold " + SEGMENT_TONE[s.segment]}>
                  {s.label}
                </span>
                <div className="mt-2 text-2xl font-semibold">{s.count}</div>
                <div className="text-xs text-zinc-500">{formatPLNFromGrosze(s.monetary)}</div>
              </button>
            ))}
          </div>

          <Card className="space-y-3 p-4">
            <div>
              <div className="font-semibold">{active?.label}</div>
              <div className="text-xs text-zinc-500">{active?.hint}</div>
            </div>
            {patients.length === 0 ? (
              <div className="text-sm text-zinc-500">Brak pacjentów w tym segmencie.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-zinc-500">
                      {(
                        [
                          ["name", "Pacjent", ""],
                          ["rfm", "R-F-M", ""],
                          ["daysSince", "Ostatnio", ""],
                          ["frequency", "Wizyty i zakupy", ""],
                          ["monetary", "Wydano", "text-right"],
                        ] as [SortKey, string, string][]
                      ).map(([key, label, align]) => (
                        <th key={key} className={"py-1 pr-3 font-medium last:pr-0 " + align}>
                          <button
                            type="button"
                            onClick={() => changeSort(key)}
                            className={"hover:text-zinc-900 dark:hover:text-white " + (sort === key ? "text-zinc-900 dark:text-white" : "")}
                          >
                            {label}
                            {arrow(key)}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {patients.map((p) => (
                      <tr key={p.id} className="border-t border-zinc-200 dark:border-zinc-800">
                        <td className="py-1.5 pr-3">
                          <Link href={`/admin/patients/${p.id}`} className="font-medium hover:underline">
                            {p.name}
                          </Link>
                        </td>
                        <td className="py-1.5 pr-3 font-mono text-xs">
                          {p.r}-{p.f}-{p.m}
                        </td>
                        <td className="py-1.5 pr-3">{p.daysSince} dni temu</td>
                        <td className="py-1.5 pr-3">{p.frequency}</td>
                        <td className="py-1.5 text-right">{formatPLNFromGrosze(p.monetary)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
                  <span>
                    {data?.segmentTotal ? (currentPageFrom(data.page, pageSize)) : 0}–
                    {Math.min(data?.segmentTotal ?? 0, (data?.page ?? 1) * pageSize)} z {data?.segmentTotal ?? 0}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={(data?.page ?? 1) <= 1}
                      onClick={() => setPage((current) => Math.max(1, current - 1))}
                      className="rounded-md border px-2 py-1 disabled:opacity-40"
                    >
                      ‹ Poprzednia
                    </button>
                    <span>
                      Strona {data?.page ?? 1} z {data?.pageCount ?? 1}
                    </span>
                    <button
                      type="button"
                      disabled={(data?.page ?? 1) >= (data?.pageCount ?? 1)}
                      onClick={() => setPage((current) => current + 1)}
                      className="rounded-md border px-2 py-1 disabled:opacity-40"
                    >
                      Następna ›
                    </button>
                    <select
                      value={pageSize}
                      onChange={(event) => {
                        setPageSize(Number(event.target.value));
                        setPage(1);
                      }}
                      className="rounded-md border bg-transparent px-1 py-1"
                      aria-label="Liczba pacjentów na stronie"
                    >
                      {[25, 50, 100].map((size) => (
                        <option key={size} value={size}>
                          {size} / str.
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </>
      )}
    </section>
  );
}

export function RfmBadge({ patientId }: { patientId: string }) {
  const { data } = useSWR(`/api/admin/analytics/rfm?patientId=${encodeURIComponent(patientId)}`, fetcher);
  const rfm = data?.rfm as
    | { r: number; f: number; m: number; segment: RfmSegment; label: string; hint: string }
    | null
    | undefined;
  if (!rfm) return null;
  return (
    <Card className="flex flex-wrap items-center gap-3 p-3" title={rfm.hint}>
      <span className={"rounded-full px-2.5 py-0.5 text-xs font-semibold " + SEGMENT_TONE[rfm.segment]}>{rfm.label}</span>
      <span className="font-mono text-xs text-zinc-600 dark:text-zinc-400">
        RFM {rfm.r}-{rfm.f}-{rfm.m}
      </span>
      <span className="text-xs text-zinc-500">{rfm.hint}</span>
    </Card>
  );
}

const SEGMENT_SHORT_LABEL: Record<RfmSegment, string> = {
  VIP: "VIP",
  LOYAL: "Lojalni",
  NEW: "Nowi",
  WIN_BACK: "Do odzyskania",
  AT_RISK: "Zagrożeni",
  DORMANT: "Uśpieni",
  OTHER: "Pozostali",
};

export const RFM_SEGMENT_FILTER_OPTIONS: { value: RfmSegment; label: string }[] = (
  ["VIP", "LOYAL", "NEW", "WIN_BACK", "AT_RISK", "DORMANT"] as RfmSegment[]
).map((value) => ({ value, label: SEGMENT_SHORT_LABEL[value] }));

/** Mała odznaka segmentu do list pacjentów. */
export function RfmSegmentBadge({ segment }: { segment?: string | null }) {
  if (!segment || !(segment in SEGMENT_TONE)) return null;
  const key = segment as RfmSegment;
  return (
    <span className={"inline-block shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold " + SEGMENT_TONE[key]}>
      {SEGMENT_SHORT_LABEL[key]}
    </span>
  );
}
