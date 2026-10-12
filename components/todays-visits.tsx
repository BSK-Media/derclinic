"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { effectiveAppointmentStatus, appointmentStatusLabel } from "@/lib/appointment-status";
import { warsawParts, warsawWallTimeToUtc } from "@/lib/warsaw-time";
import { isWorkingOnDay, type CustomWorkDay, type TimeOff, type WorkDay } from "@/lib/public-booking";

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((response) => response.json());

// Znacznik systemowy blokady czasu (nie jest prawdziwą wizytą pacjenta).
const RESERVATION_MARKER = "__DERCLINIC_REZERWACJA_CZASU__";

type VisitRow = {
  id: string;
  startsAt: string;
  endsAt?: string;
  status: string;
  customServiceName?: string | null;
  patient?: { name?: string | null } | null;
  service?: { name?: string | null } | null;
  specialist?: { id: string; name: string } | null;
};

type SpecialistRow = {
  id: string;
  name: string;
  workDays: WorkDay[];
  customWorkDays: CustomWorkDay[];
  timeOffs: TimeOff[];
};

const ONLY_WORKING_KEY = "todaysVisits.onlyWorking";

/** Granice bieżącego dnia (czas warszawski) jako znaczniki UTC: [od, do). */
function todayRange(now: Date) {
  const { year, month, day } = warsawParts(now);
  const from = warsawWallTimeToUtc({ year, month, day, hour: 0, minute: 0 });
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const to = warsawWallTimeToUtc({
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
    hour: 0,
    minute: 0,
  });
  return { from: from.toISOString(), to: to.toISOString() };
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("pl-PL", { timeZone: "Europe/Warsaw", hour: "2-digit", minute: "2-digit" });
}

const STATUS_STYLES: Record<string, string> = {
  SCHEDULED: "bg-blue-50 text-blue-700",
  AWAITING: "bg-amber-50 text-amber-800",
  COMPLETED: "bg-emerald-50 text-emerald-700",
  CANCELED: "bg-zinc-100 text-zinc-500",
  NO_SHOW: "bg-red-50 text-red-700",
};

// Karta wizyty: specjalista otwiera swój widok, a recepcja/manager/admin — kartę z panelu recepcji
// (strona specjalisty wpuszcza tylko jego samego, admina i managera tej lokalizacji).
function VisitList({ visits, now, hrefBase }: { visits: VisitRow[]; now: Date; hrefBase: string }) {
  return (
    <ul className="divide-y rounded-2xl border bg-white shadow-sm dark:bg-zinc-950">
      {visits.map((visit) => {
        const status = effectiveAppointmentStatus(visit.status, visit.startsAt, now) ?? visit.status;
        const faded = visit.status === "CANCELED";
        return (
          <li key={visit.id}>
            <Link
              href={`${hrefBase}/${visit.id}`}
              className={"flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-white/5 " + (faded ? "opacity-60" : "")}
            >
              <span className="w-24 shrink-0 text-sm font-semibold tabular-nums">
                {formatTime(visit.startsAt)}
                {visit.endsAt ? <span className="font-normal text-zinc-400"> – {formatTime(visit.endsAt)}</span> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{visit.patient?.name ?? "—"}</span>
                <span className="block truncate text-xs text-zinc-500">
                  {visit.customServiceName || visit.service?.name || "—"}
                </span>
              </span>
              <span className={"rounded-full px-2.5 py-1 text-xs font-medium " + (STATUS_STYLES[status] ?? "bg-zinc-100 text-zinc-600")}>
                {appointmentStatusLabel(visit.status, visit.startsAt, now)}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * "Wizyty dziś": pracownik widzi własną listę, recepcja (i administracja) —
 * wizyty podzielone na pracowników.
 */
export function TodaysVisits({ mode }: { mode: "own" | "grouped" }) {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const range = React.useMemo(() => todayRange(now), [now]);
  const url =
    mode === "own"
      ? `/api/specialist/appointments?from=${range.from}&to=${range.to}`
      : `/api/admin/appointments?from=${range.from}&to=${range.to}`;
  const { data, isLoading } = useSWR(url, fetcher, { refreshInterval: 60_000 });

  const visits = React.useMemo(
    () =>
      ((data?.appointments ?? []) as VisitRow[]).filter(
        (visit) => visit.patient?.name !== RESERVATION_MARKER && visit.service?.name !== RESERVATION_MARKER,
      ),
    [data],
  );

  // Filtr „Pracujący dziś": tylko specjaliści, którzy według grafiku (z dniami niestandardowymi i wolnymi)
  // dziś pracują. Domyślnie włączony; wybór zapamiętujemy w przeglądarce.
  const [onlyWorking, setOnlyWorking] = React.useState(true);
  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(ONLY_WORKING_KEY);
      if (saved !== null) setOnlyWorking(saved === "1");
    } catch {
      /* brak dostępu do pamięci przeglądarki — zostaje wartość domyślna */
    }
  }, []);
  function toggleOnlyWorking(value: boolean) {
    setOnlyWorking(value);
    try {
      window.localStorage.setItem(ONLY_WORKING_KEY, value ? "1" : "0");
    } catch {
      /* ignorujemy */
    }
  }

  const workingToday = React.useMemo(() => {
    const { year, month, day } = warsawParts(now);
    const ids = new Set<string>();
    for (const specialist of (data?.specialists ?? []) as SpecialistRow[]) {
      if (
        isWorkingOnDay({
          year,
          month,
          day,
          workDays: specialist.workDays ?? [],
          customWorkDays: specialist.customWorkDays ?? [],
          timeOffs: specialist.timeOffs ?? [],
        })
      ) {
        ids.add(specialist.id);
      }
    }
    return ids;
  }, [data, now]);

  const filtering = mode === "grouped" && onlyWorking && !isLoading;
  const shownVisits = React.useMemo(
    () => (filtering ? visits.filter((visit) => !visit.specialist?.id || workingToday.has(visit.specialist.id)) : visits),
    [filtering, visits, workingToday],
  );
  const hiddenVisitsCount = visits.length - shownVisits.length;

  const groups = React.useMemo(() => {
    const map = new Map<string, { name: string; visits: VisitRow[] }>();
    // Przy włączonym filtrze pokazujemy wszystkich pracujących dziś specjalistów, także bez wizyt.
    if (filtering) {
      for (const specialist of (data?.specialists ?? []) as SpecialistRow[]) {
        if (workingToday.has(specialist.id)) map.set(specialist.id, { name: specialist.name, visits: [] });
      }
    }
    for (const visit of shownVisits) {
      const key = visit.specialist?.id ?? "unknown";
      const group = map.get(key) ?? { name: visit.specialist?.name ?? "Bez przypisanego pracownika", visits: [] };
      group.visits.push(visit);
      map.set(key, group);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "pl"));
  }, [filtering, data, workingToday, shownVisits]);

  const dateLabel = now.toLocaleDateString("pl-PL", {
    timeZone: "Europe/Warsaw",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Wizyty dziś</h1>
        <p className="text-sm capitalize text-zinc-500">
          {dateLabel}
          {!isLoading ? ` · ${shownVisits.length} ${shownVisits.length === 1 ? "wizyta" : "wizyt"}` : ""}
        </p>
        {mode === "grouped" ? (
          <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={onlyWorking}
              onChange={(event) => toggleOnlyWorking(event.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 accent-emerald-600"
            />
            Pracujący dziś
          </label>
        ) : null}
        {filtering && hiddenVisitsCount > 0 ? (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
            Ukryto {hiddenVisitsCount} {hiddenVisitsCount === 1 ? "wizytę" : "wizyt"} specjalistów, którzy dziś nie pracują
            według grafiku. Odznacz „Pracujący dziś”, żeby je zobaczyć.
          </p>
        ) : null}
      </div>

      {isLoading ? <p className="text-sm text-zinc-500">Ładowanie…</p> : null}
      {!isLoading && visits.length === 0 && !(filtering && groups.length > 0) ? (
        <div className="rounded-2xl border bg-white p-6 text-center text-sm text-zinc-500 shadow-sm dark:bg-zinc-950">
          Brak wizyt na dziś.
        </div>
      ) : null}
      {filtering && groups.length === 0 && visits.length > 0 ? (
        <div className="rounded-2xl border bg-white p-6 text-center text-sm text-zinc-500 shadow-sm dark:bg-zinc-950">
          Dziś nie pracuje żaden specjalista według grafiku.
        </div>
      ) : null}

      {mode === "own" ? (
        visits.length > 0 ? <VisitList visits={visits} now={now} hrefBase="/specialist/appointments" /> : null
      ) : (
        groups.map((group) => (
          <section key={group.name} className="space-y-2">
            <h2 className="flex items-baseline gap-2 text-base font-semibold">
              {group.name}
              <span className="text-xs font-normal text-zinc-500">
                {group.visits.length} {group.visits.length === 1 ? "wizyta" : "wizyt"}
              </span>
            </h2>
            {group.visits.length > 0 ? (
              <VisitList visits={group.visits} now={now} hrefBase="/admin/appointments" />
            ) : (
              <p className="rounded-2xl border bg-white px-4 py-3 text-sm text-zinc-500 dark:bg-zinc-950">Brak wizyt.</p>
            )}
          </section>
        ))
      )}
    </div>
  );
}
