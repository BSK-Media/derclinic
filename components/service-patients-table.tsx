"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatPLNFromGrosze } from "@/lib/money";

const fetcher = (url: string) => fetch(url).then((response) => response.json());

type RangeKey = "7d" | "30d" | "365d" | "all" | "custom";
type SortKey = "name" | "visitsCount" | "lastVisitAt" | "totalSpentOnService" | "totalSpentClinic";
type SortDirection = "asc" | "desc";

type ServicePatient = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  visitsCount: number;
  lastVisitAt: string;
  totalSpentOnService?: number;
  totalSpentClinic?: number;
};

const WARSAW_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Warsaw",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function warsawDateInput(date = new Date()) {
  return WARSAW_DATE_FORMATTER.format(date);
}

function addDaysToDateInput(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

const RANGE_OPTIONS: Array<{ key: RangeKey; label: string }> = [
  { key: "7d", label: "7 dni" },
  { key: "30d", label: "30 dni" },
  { key: "365d", label: "365 dni" },
  { key: "all", label: "Cały okres" },
  { key: "custom", label: "Niestandardowy zakres" },
];

export function ServicePatientsTable({ serviceId }: { serviceId: string }) {
  const today = React.useMemo(() => warsawDateInput(), []);
  const [range, setRange] = React.useState<RangeKey>("custom");
  const [from, setFrom] = React.useState(() => `${today.slice(0, 4)}-01-01`);
  const [to, setTo] = React.useState(today);
  const [search, setSearch] = React.useState("");
  const [sortKey, setSortKey] = React.useState<SortKey>("lastVisitAt");
  const [sortDirection, setSortDirection] = React.useState<SortDirection>("desc");

  function selectRange(nextRange: RangeKey) {
    setRange(nextRange);
    if (nextRange === "7d") {
      setFrom(addDaysToDateInput(today, -6));
      setTo(today);
    } else if (nextRange === "30d") {
      setFrom(addDaysToDateInput(today, -29));
      setTo(today);
    } else if (nextRange === "365d") {
      setFrom(addDaysToDateInput(today, -364));
      setTo(today);
    } else if (nextRange === "custom" && (!from || !to)) {
      setFrom(`${today.slice(0, 4)}-01-01`);
      setTo(today);
    }
  }

  const query =
    range === "all"
      ? `/api/admin/services/${serviceId}/patients`
      : from && to
        ? `/api/admin/services/${serviceId}/patients?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
        : null;
  const { data, isLoading } = useSWR(query, fetcher);
  const patients: ServicePatient[] = data?.patients ?? [];
  const isAdmin = data?.viewerRole === "ADMIN";

  const filteredPatients = React.useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("pl-PL");
    const filtered = normalizedSearch
      ? patients.filter(
          (patient) =>
            patient.name.toLocaleLowerCase("pl-PL").includes(normalizedSearch) ||
            patient.phone?.toLocaleLowerCase("pl-PL").includes(normalizedSearch) ||
            patient.email?.toLocaleLowerCase("pl-PL").includes(normalizedSearch),
        )
      : patients;

    return [...filtered].sort((left, right) => {
      let comparison = 0;
      if (sortKey === "name") {
        comparison = left.name.localeCompare(right.name, "pl");
      } else if (sortKey === "lastVisitAt") {
        comparison = new Date(left.lastVisitAt).getTime() - new Date(right.lastVisitAt).getTime();
      } else {
        comparison = (left[sortKey] ?? 0) - (right[sortKey] ?? 0);
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [patients, search, sortDirection, sortKey]);

  function changeSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "desc" ? "asc" : "desc"));
      return;
    }
    setSortKey(nextKey);
    setSortDirection(nextKey === "name" ? "asc" : "desc");
  }

  function sortIcon(key: SortKey) {
    if (sortKey !== key) return <ArrowUpDown className="h-3.5 w-3.5" />;
    return sortDirection === "desc" ? (
      <ArrowDown className="h-3.5 w-3.5" />
    ) : (
      <ArrowUp className="h-3.5 w-3.5" />
    );
  }

  function sortableHeader(key: SortKey, label: string) {
    return (
      <button
        type="button"
        onClick={() => changeSort(key)}
        className="inline-flex items-center gap-1.5 font-medium hover:text-zinc-900 dark:hover:text-white"
      >
        {label}
        {sortIcon(key)}
      </button>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border bg-white shadow-sm dark:bg-zinc-950">
      <div className="space-y-3 border-b p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="font-semibold">Pacjenci korzystający z usługi</div>
            <div className="mt-1 text-xs text-zinc-500">
              Tylko zakończone, zaakceptowane i nieusunięte wizyty
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => selectRange(option.key)}
                className={
                  "rounded-lg border px-3 py-1.5 text-xs font-medium transition " +
                  (range === option.key
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900"
                    : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-900")
                }
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Szukaj pacjenta, telefonu lub e-maila"
            className="min-w-60 flex-1"
          />
          {range === "custom" ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="date"
                value={from}
                max={to || today}
                onChange={(event) => setFrom(event.target.value)}
                className="w-40"
              />
              <span className="text-zinc-400">–</span>
              <Input
                type="date"
                value={to}
                min={from}
                max={today}
                onChange={(event) => setTo(event.target.value)}
                className="w-40"
              />
            </div>
          ) : null}
        </div>
      </div>

      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-zinc-500">
            <tr>
              <th className="p-3">{sortableHeader("name", "Pacjent")}</th>
              <th className="p-3">Telefon</th>
              <th className="p-3">E-mail</th>
              <th className="p-3">{sortableHeader("visitsCount", "Liczba wizyt")}</th>
              <th className="p-3">{sortableHeader("lastVisitAt", "Ostatnia wizyta")}</th>
              {isAdmin ? (
                <>
                  <th className="p-3">
                    {sortableHeader("totalSpentOnService", "Wydano na tę usługę")}
                  </th>
                  <th className="p-3">{sortableHeader("totalSpentClinic", "Wydano w klinice")}</th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {!isLoading && filteredPatients.length === 0 ? (
              <tr>
                <td className="p-6 text-center text-zinc-500" colSpan={isAdmin ? 7 : 5}>
                  Brak pacjentów w wybranym zakresie.
                </td>
              </tr>
            ) : null}
            {filteredPatients.map((patient) => (
              <tr key={patient.id} className="border-t">
                <td className="p-3 font-medium">
                  <Link
                    href={`/admin/patients/${patient.id}`}
                    className="underline-offset-2 hover:text-emerald-700 hover:underline dark:hover:text-emerald-300"
                  >
                    {patient.name}
                  </Link>
                </td>
                <td className="p-3">{patient.phone || "—"}</td>
                <td className="p-3">{patient.email || "—"}</td>
                <td className="p-3 font-medium">{patient.visitsCount}</td>
                <td className="p-3">{new Date(patient.lastVisitAt).toLocaleDateString("pl-PL")}</td>
                {isAdmin ? (
                  <>
                    <td className="p-3 font-medium text-emerald-700 dark:text-emerald-300">
                      {formatPLNFromGrosze(patient.totalSpentOnService ?? 0)}
                    </td>
                    <td className="p-3 font-medium">
                      {formatPLNFromGrosze(patient.totalSpentClinic ?? 0)}
                    </td>
                  </>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
