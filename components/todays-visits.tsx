"use client";

import * as React from "react";
import Link from "next/link";
import useSWR from "swr";
import { effectiveAppointmentStatus, appointmentStatusLabel, isAppointmentEnded } from "@/lib/appointment-status";
import { warsawParts, warsawWallTimeToUtc } from "@/lib/warsaw-time";

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((response) => response.json());

// Znacznik systemowy blokady czasu (nie jest prawdziwą wizytą pacjenta).
const RESERVATION_MARKER = "__DERCLINIC_REZERWACJA_CZASU__";

type VisitRow = {
  id: string;
  startsAt: string;
  endsAt?: string;
  status: string;
  consumptionConfirmedAt?: string | null;
  consumptions?: unknown[];
  customServiceName?: string | null;
  patient?: { name?: string | null } | null;
  service?: { name?: string | null } | null;
  specialist?: { id: string; name: string } | null;
};

/** Początek dnia (czas warszawski) przesuniętego o `offsetDays` względem podanej daty, jako UTC. */
function warsawDayStart(date: { year: number; month: number; day: number }, offsetDays = 0) {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + offsetDays));
  return warsawWallTimeToUtc({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: 0,
    minute: 0,
  });
}

/** Granice bieżącego dnia (czas warszawski) jako znaczniki UTC: [od, do). */
function todayRange(now: Date) {
  const today = warsawParts(now);
  return { from: warsawDayStart(today).toISOString(), to: warsawDayStart(today, 1).toISOString() };
}

function dateKeyOf(date: { year: number; month: number; day: number }) {
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

/** Odbyta wizyta, przy której nie zapisano zużycia preparatów (recepcja ma je uzupełnić). */
function missingConsumption(visit: VisitRow) {
  return isAppointmentEnded(visit) && !visit.consumptionConfirmedAt && (visit.consumptions?.length ?? 0) === 0;
}

function capitalizeFirst(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function groupBySpecialist(visits: VisitRow[]) {
  const map = new Map<string, { name: string; visits: VisitRow[] }>();
  for (const visit of visits) {
    const key = visit.specialist?.id ?? "unknown";
    const group = map.get(key) ?? { name: visit.specialist?.name ?? "Bez przypisanego pracownika", visits: [] };
    group.visits.push(visit);
    map.set(key, group);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "pl"));
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
              {missingConsumption(visit) ? (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900">
                  Brak zużycia preparatów
                </span>
              ) : null}
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
 * "Dzisiejsze wizyty": pracownik widzi własną listę, recepcja (i administracja) —
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

  const groups = React.useMemo(() => groupBySpecialist(visits), [visits]);

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
        <h1 className="text-2xl font-semibold">Dzisiejsze wizyty</h1>
        <p className="text-sm capitalize text-zinc-500">
          {dateLabel}
          {!isLoading ? ` · ${visits.length} ${visits.length === 1 ? "wizyta" : "wizyt"}` : ""}
        </p>
      </div>

      {isLoading ? <p className="text-sm text-zinc-500">Ładowanie…</p> : null}
      {!isLoading && visits.length === 0 ? (
        <div className="rounded-2xl border bg-white p-6 text-center text-sm text-zinc-500 shadow-sm dark:bg-zinc-950">
          Brak wizyt na dziś.
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
            <VisitList visits={group.visits} now={now} hrefBase="/admin/appointments" />
          </section>
        ))
      )}
    </div>
  );
}

/**
 * "Przeszłe wizyty": wizyty, które już się odbyły (start przed chwilą obecną), dzień po dniu
 * od najnowszego, w każdym dniu podzielone na pracowników — jak "Dzisiejsze wizyty".
 */
export function PastVisits() {
  const [now] = React.useState(() => new Date());
  const today = React.useMemo(() => warsawParts(now), [now]);
  const [from, setFrom] = React.useState(() => dateKeyOf(warsawParts(warsawDayStart(warsawParts(now), -6))));
  const [to, setTo] = React.useState(() => dateKeyOf(today));
  const [onlyMissing, setOnlyMissing] = React.useState(false);

  const range = React.useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return null;
    return { from: warsawDayStart(parseDateKey(from)).toISOString(), to: warsawDayStart(parseDateKey(to), 1).toISOString() };
  }, [from, to]);
  const { data, isLoading } = useSWR(
    range ? `/api/admin/appointments?from=${range.from}&to=${range.to}` : null,
    fetcher,
  );

  const visits = React.useMemo(
    () =>
      ((data?.appointments ?? []) as VisitRow[])
        .filter(
          (visit) =>
            visit.patient?.name !== RESERVATION_MARKER &&
            visit.service?.name !== RESERVATION_MARKER &&
            // Tylko wizyty, które już się skończyły (trwające zostają w "Dzisiejszych wizytach").
            new Date(visit.endsAt ?? visit.startsAt).getTime() <= now.getTime(),
        )
        .filter((visit) => !onlyMissing || missingConsumption(visit)),
    [data, now, onlyMissing],
  );
  const missingCount = React.useMemo(
    () => ((data?.appointments ?? []) as VisitRow[]).filter(missingConsumption).length,
    [data],
  );

  const days = React.useMemo(() => {
    const map = new Map<string, VisitRow[]>();
    for (const visit of visits) {
      const key = dateKeyOf(warsawParts(new Date(visit.startsAt)));
      map.set(key, [...(map.get(key) ?? []), visit]);
    }
    return [...map.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, dayVisits]) => ({
        key,
        label: capitalizeFirst(
          new Date(`${key}T12:00:00Z`).toLocaleDateString("pl-PL", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          }),
        ),
        groups: groupBySpecialist(dayVisits.sort((a, b) => a.startsAt.localeCompare(b.startsAt))),
        count: dayVisits.length,
      }));
  }, [visits]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Przeszłe wizyty</h1>
          <p className="text-sm text-zinc-500">
            {!isLoading ? `${visits.length} ${visits.length === 1 ? "wizyta" : "wizyt"}` : "Ładowanie…"}
            {missingCount > 0 ? ` · bez zużycia preparatów: ${missingCount}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3 text-sm">
          <label className="space-y-1">
            <span className="block text-xs text-zinc-500">Od</span>
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="h-10 rounded-xl border bg-white px-3 dark:bg-zinc-950"
            />
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-zinc-500">Do</span>
            <input
              type="date"
              value={to}
              min={from}
              max={dateKeyOf(today)}
              onChange={(e) => setTo(e.target.value)}
              className="h-10 rounded-xl border bg-white px-3 dark:bg-zinc-950"
            />
          </label>
          <label className="flex h-10 items-center gap-2">
            <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
            Tylko bez zużycia preparatów
          </label>
        </div>
      </div>

      {!isLoading && visits.length === 0 ? (
        <div className="rounded-2xl border bg-white p-6 text-center text-sm text-zinc-500 shadow-sm dark:bg-zinc-950">
          Brak wizyt w wybranym okresie.
        </div>
      ) : null}

      {days.map((day) => (
        <section key={day.key} className="space-y-3">
          <h2 className="flex items-baseline gap-2 text-lg font-semibold">
            {day.label}
            <span className="text-xs font-normal text-zinc-500">
              {day.count} {day.count === 1 ? "wizyta" : "wizyt"}
            </span>
          </h2>
          {day.groups.map((group) => (
            <div key={group.name} className="space-y-2">
              <h3 className="text-sm font-medium text-zinc-600 dark:text-zinc-300">{group.name}</h3>
              <VisitList visits={group.visits} now={now} hrefBase="/admin/appointments" />
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
