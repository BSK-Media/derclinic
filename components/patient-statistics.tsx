"use client";

import * as React from "react";
import useSWR from "swr";
import { CalendarDays, Clock3, WalletCards } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatPLNFromGrosze } from "@/lib/money";

const fetcher = (url: string) => fetch(url).then((response) => response.json());

type RangeKey = "7d" | "30d" | "365d" | "all" | "custom";

type PatientStats = {
  totalSpent: number;
  treatmentsCount: number;
  latestTreatments: Array<{
    serviceKey: string;
    serviceName: string;
    lastVisitAt: string;
    visitsCount: number;
  }>;
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

function plural(value: number, one: string, few: string, many: string) {
  if (value === 1) return one;
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function elapsedSince(value: string) {
  const milliseconds = Math.max(0, Date.now() - new Date(value).getTime());
  const days = Math.floor(milliseconds / (24 * 60 * 60 * 1000));
  if (days === 0) return "dzisiaj";
  if (days < 30) return `${days} ${plural(days, "dzień", "dni", "dni")} temu`;
  if (days < 365) {
    const months = Math.floor(days / 30);
    return `${months} ${plural(months, "miesiąc", "miesiące", "miesięcy")} temu`;
  }
  const years = Math.floor(days / 365);
  return `${years} ${plural(years, "rok", "lata", "lat")} temu`;
}

const RANGE_OPTIONS: Array<{ key: RangeKey; label: string }> = [
  { key: "7d", label: "7 dni" },
  { key: "30d", label: "30 dni" },
  { key: "365d", label: "365 dni" },
  { key: "all", label: "Cały okres" },
  { key: "custom", label: "Niestandardowy zakres" },
];

export function PatientStatistics({ patientId }: { patientId: string }) {
  const today = React.useMemo(() => warsawDateInput(), []);
  const [range, setRange] = React.useState<RangeKey>("custom");
  const [from, setFrom] = React.useState(() => `${today.slice(0, 4)}-01-01`);
  const [to, setTo] = React.useState(today);

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
      ? `/api/admin/patients/${patientId}/stats`
      : from && to
        ? `/api/admin/patients/${patientId}/stats?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
        : null;
  const { data, isLoading } = useSWR(query, fetcher);
  const stats: PatientStats = data?.stats ?? {
    totalSpent: 0,
    treatmentsCount: 0,
    latestTreatments: [],
  };

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-semibold">Statystyki pacjenta</div>
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
                  : "bg-white text-zinc-600 hover:bg-zinc-50 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900")
              }
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {range === "custom" ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-zinc-50 p-3 dark:bg-white/[0.04]">
          <span className="text-xs font-medium text-zinc-500">Zakres:</span>
          <Input
            type="date"
            value={from}
            max={to || today}
            onChange={(event) => setFrom(event.target.value)}
            className="w-40 bg-white dark:bg-zinc-950"
          />
          <span className="text-zinc-400">–</span>
          <Input
            type="date"
            value={to}
            min={from}
            max={today}
            onChange={(event) => setTo(event.target.value)}
            className="w-40 bg-white dark:bg-zinc-950"
          />
          <span className="text-xs text-zinc-500">Domyślnie: od 01.01 bieżącego roku</span>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border bg-emerald-50/70 p-4 dark:bg-emerald-500/10">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-emerald-900 dark:text-emerald-200">
              Łącznie wydano
            </div>
            <WalletCards className="h-5 w-5 text-emerald-700 dark:text-emerald-300" />
          </div>
          <div className="mt-3 text-3xl font-semibold text-emerald-950 dark:text-emerald-100">
            {isLoading ? "…" : formatPLNFromGrosze(stats.totalSpent)}
          </div>
        </div>
        <div className="rounded-2xl border bg-sky-50/70 p-4 dark:bg-sky-500/10">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-sky-900 dark:text-sky-200">
              Wykonane zabiegi
            </div>
            <CalendarDays className="h-5 w-5 text-sky-700 dark:text-sky-300" />
          </div>
          <div className="mt-3 text-3xl font-semibold text-sky-950 dark:text-sky-100">
            {isLoading ? "…" : stats.treatmentsCount}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border">
        <div className="flex items-center gap-2 border-b px-4 py-3 font-medium">
          <Clock3 className="h-4 w-4 text-violet-600" />
          Czas od ostatniego wykonania poszczególnych zabiegów
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
          {!isLoading && stats.latestTreatments.length === 0 ? (
            <div className="text-sm text-zinc-500">Brak wykonanych zabiegów w tym okresie.</div>
          ) : null}
          {stats.latestTreatments.map((treatment) => (
            <div
              key={treatment.serviceKey}
              className="rounded-xl bg-zinc-50 p-3 dark:bg-white/[0.04]"
            >
              <div className="font-medium">{treatment.serviceName}</div>
              <div className="mt-1 text-sm font-semibold text-violet-700 dark:text-violet-300">
                {elapsedSince(treatment.lastVisitAt)}
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                Ostatnio: {new Date(treatment.lastVisitAt).toLocaleDateString("pl-PL")} • Łącznie w
                okresie: {treatment.visitsCount}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
