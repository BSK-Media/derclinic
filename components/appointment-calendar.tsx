"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { effectiveAppointmentStatus } from "@/lib/appointment-status";

export type CalendarAppointment = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  approvalStatus?: string;
  customServiceName?: string | null;
  patient: { name: string };
  service: { name: string };
  specialist?: { name: string } | null;
};

type CalendarViewMode = "day" | "week" | "month";

const WEEKDAYS = ["PON", "WT", "ŚR", "CZW", "PT", "SOB", "NDZ"];

function weekdayLabel(date: Date) {
  return WEEKDAYS[(date.getDay() + 6) % 7];
}

// Wysokość jednej godziny w widokach Dzień/Tydzień (px)
const HOUR_HEIGHT = 64;
// Domyślny zakres godzin — rozszerzany automatycznie, gdy wizyty wykraczają poza
const DEFAULT_START_HOUR = 7;
const DEFAULT_END_HOUR = 21;

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function startOfGrid(d: Date) {
  const first = startOfMonth(d);
  const day = (first.getDay() + 6) % 7; // Monday = 0
  const grid = new Date(first);
  grid.setDate(grid.getDate() - day);
  grid.setHours(0, 0, 0, 0);
  return grid;
}
function startOfWeek(d: Date) {
  const day = (d.getDay() + 6) % 7; // Monday = 0
  const start = new Date(d);
  start.setDate(start.getDate() - day);
  start.setHours(0, 0, 0, 0);
  return start;
}
function startOfDay(d: Date) {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  return start;
}
function dateKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function sameDay(a: Date, b: Date) {
  return dateKey(a) === dateKey(b);
}

const STATUS_DOT: Record<string, string> = {
  SCHEDULED: "bg-indigo-500",
  AWAITING: "bg-orange-500",
  COMPLETED: "bg-emerald-500",
  CANCELED: "bg-red-400",
  NO_SHOW: "bg-amber-500",
};

const STATUS_BLOCK: Record<string, string> = {
  SCHEDULED:
    "border-indigo-300 bg-indigo-50 text-indigo-900 dark:border-indigo-500/40 dark:bg-indigo-500/15 dark:text-indigo-100",
  AWAITING:
    "border-orange-300 bg-orange-50 text-orange-900 dark:border-orange-500/40 dark:bg-orange-500/15 dark:text-orange-100",
  COMPLETED:
    "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-100",
  CANCELED:
    "border-red-300 bg-red-50 text-red-900 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-100",
  NO_SHOW:
    "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-100",
};

type PositionedEvent = {
  appointment: CalendarAppointment;
  col: number;
  cols: number;
};

// Układa nakładające się wizyty w kolumnach obok siebie (jak w Amelii)
function layoutOverlaps(list: CalendarAppointment[]): PositionedEvent[] {
  const sorted = [...list].sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
  const positioned: PositionedEvent[] = [];

  let cluster: CalendarAppointment[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    if (cluster.length === 0) return;
    const colEnds: number[] = [];
    const items = cluster.map((appointment) => {
      const start = +new Date(appointment.startsAt);
      const end = Math.max(+new Date(appointment.endsAt), start + 15 * 60_000);
      let col = colEnds.findIndex((endsAt) => endsAt <= start);
      if (col === -1) {
        col = colEnds.length;
        colEnds.push(end);
      } else {
        colEnds[col] = end;
      }
      return { appointment, col };
    });
    for (const item of items) positioned.push({ ...item, cols: colEnds.length });
    cluster = [];
  };

  for (const appointment of sorted) {
    const start = +new Date(appointment.startsAt);
    const end = Math.max(+new Date(appointment.endsAt), start + 15 * 60_000);
    if (cluster.length > 0 && start >= clusterEnd) {
      flush();
      clusterEnd = -Infinity;
    }
    cluster.push(appointment);
    clusterEnd = Math.max(clusterEnd, end);
  }
  flush();

  return positioned;
}

export function AppointmentCalendar({
  anchor,
  onAnchorChange,
  appointments,
  isLoading,
  onAdd,
  onOpenAppointment,
  showSpecialist = false,
  showAddButton = true,
}: {
  anchor: Date;
  onAnchorChange: (d: Date) => void;
  appointments: CalendarAppointment[];
  isLoading?: boolean;
  onAdd?: (date?: Date) => void;
  onOpenAppointment: (id: string) => void;
  showSpecialist?: boolean;
  showAddButton?: boolean;
}) {
  const [clock, setClock] = React.useState(() => new Date());
  const [mode, setMode] = React.useState<CalendarViewMode>("month");
  const gridStart = React.useMemo(() => startOfGrid(anchor), [anchor]);

  React.useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const weeks = React.useMemo(() => {
    const cells: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(d.getDate() + i);
      cells.push(d);
    }
    const rows: Date[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [gridStart]);

  const byDay = React.useMemo(() => {
    const map = new Map<string, CalendarAppointment[]>();
    for (const a of appointments) {
      const key = dateKey(new Date(a.startsAt));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    for (const list of map.values())
      list.sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
    return map;
  }, [appointments]);

  const today = new Date();

  // Dni widoczne w bieżącym trybie (poza miesiącem)
  const visibleDays = React.useMemo(() => {
    if (mode === "day") return [startOfDay(anchor)];
    if (mode === "week") {
      const start = startOfWeek(anchor);
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        return d;
      });
    }
    return [];
  }, [mode, anchor]);

  // Zakres godzin na osi Y — rozszerzany, jeśli wizyty wykraczają poza domyślny
  const hourRange = React.useMemo(() => {
    let startHour = DEFAULT_START_HOUR;
    let endHour = DEFAULT_END_HOUR;
    for (const day of visibleDays) {
      const list = byDay.get(dateKey(day)) ?? [];
      for (const a of list) {
        const s = new Date(a.startsAt);
        const e = new Date(a.endsAt);
        startHour = Math.min(startHour, s.getHours());
        const endH = e.getHours() + (e.getMinutes() > 0 ? 1 : 0);
        if (sameDay(s, e)) endHour = Math.max(endHour, Math.min(24, endH));
        else endHour = 24;
      }
    }
    return { startHour, endHour };
  }, [visibleDays, byDay]);

  const hours = React.useMemo(
    () =>
      Array.from(
        { length: hourRange.endHour - hourRange.startHour },
        (_, i) => hourRange.startHour + i,
      ),
    [hourRange],
  );

  function shift(direction: -1 | 1) {
    if (mode === "month") {
      onAnchorChange(new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1));
      return;
    }
    const next = new Date(anchor);
    next.setDate(next.getDate() + direction * (mode === "week" ? 7 : 1));
    onAnchorChange(next);
  }

  const rangeLabel = React.useMemo(() => {
    if (mode === "month") {
      return anchor.toLocaleDateString("pl-PL", { month: "long", year: "numeric" });
    }
    if (mode === "week") {
      const start = startOfWeek(anchor);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      const startLabel = start.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit" });
      const endLabel = end.toLocaleDateString("pl-PL", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
      return `${startLabel} – ${endLabel}`;
    }
    return anchor.toLocaleDateString("pl-PL", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }, [mode, anchor]);

  const prevAriaLabel =
    mode === "month" ? "Poprzedni miesiąc" : mode === "week" ? "Poprzedni tydzień" : "Poprzedni dzień";
  const nextAriaLabel =
    mode === "month" ? "Następny miesiąc" : mode === "week" ? "Następny tydzień" : "Następny dzień";

  function renderTimeGrid(days: Date[]) {
    const gridHeight = hours.length * HOUR_HEIGHT;
    const nowOffset =
      (clock.getHours() - hourRange.startHour) * HOUR_HEIGHT +
      (clock.getMinutes() / 60) * HOUR_HEIGHT;
    const nowVisible = nowOffset >= 0 && nowOffset <= gridHeight;

    return (
      <div className="overflow-auto">
        <div className="min-w-[640px]">
          {days.length > 1 ? (
            <div className="grid border-b" style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}>
              <div />
              {days.map((day) => {
                const isToday = sameDay(day, today);
                return (
                  <div key={dateKey(day)} className="border-l px-2 py-2 text-center">
                    <div className="text-xs uppercase text-zinc-500">
                      {weekdayLabel(day)}
                    </div>
                    <div
                      className={
                        "mx-auto mt-0.5 inline-flex h-7 min-w-7 items-center justify-center rounded-lg px-1 text-sm " +
                        (isToday
                          ? "bg-indigo-600 font-semibold text-white"
                          : "text-zinc-800 dark:text-zinc-200")
                      }
                    >
                      {day.getDate()}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          <div className="grid" style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}>
            {/* Oś godzin */}
            <div className="relative" style={{ height: gridHeight }}>
              {hours.map((hour, index) => (
                <div
                  key={hour}
                  className="absolute right-2 -translate-y-1/2 text-[11px] text-zinc-400"
                  style={{ top: index * HOUR_HEIGHT }}
                >
                  {index === 0 ? "" : `${String(hour).padStart(2, "0")}:00`}
                </div>
              ))}
            </div>

            {/* Kolumny dni */}
            {days.map((day) => {
              const isToday = sameDay(day, today);
              const list = byDay.get(dateKey(day)) ?? [];
              const positioned = layoutOverlaps(list);
              return (
                <div
                  key={dateKey(day)}
                  className="relative border-l"
                  style={{ height: gridHeight }}
                >
                  {/* Linie godzin + kliknięcie w pusty slot */}
                  {hours.map((hour, index) => (
                    <div
                      key={hour}
                      className={
                        "absolute inset-x-0 border-t border-zinc-100 dark:border-zinc-800 " +
                        (onAdd ? "cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/40" : "")
                      }
                      style={{ top: index * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                      onClick={
                        onAdd
                          ? () => {
                              const slot = new Date(day);
                              slot.setHours(hour, 0, 0, 0);
                              onAdd(slot);
                            }
                          : undefined
                      }
                    />
                  ))}

                  {/* Wskaźnik bieżącej godziny */}
                  {isToday && nowVisible ? (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-20"
                      style={{ top: nowOffset }}
                    >
                      <div className="relative border-t-2 border-red-500">
                        <span className="absolute -left-1 -top-[5px] h-2 w-2 rounded-full bg-red-500" />
                      </div>
                    </div>
                  ) : null}

                  {/* Wizyty */}
                  {positioned.map(({ appointment: a, col, cols }) => {
                    const start = new Date(a.startsAt);
                    const end = new Date(a.endsAt);
                    const startMinutes =
                      (start.getHours() - hourRange.startHour) * 60 + start.getMinutes();
                    const rawDuration = Math.max(15, (+end - +start) / 60_000);
                    const top = (startMinutes / 60) * HOUR_HEIGHT;
                    const height = Math.max(26, (rawDuration / 60) * HOUR_HEIGHT - 2);
                    const widthPct = 100 / cols;
                    const effectiveStatus =
                      a.approvalStatus === "REJECTED"
                        ? a.status
                        : effectiveAppointmentStatus(a.status, a.startsAt, clock);
                    const blockTone =
                      STATUS_BLOCK[effectiveStatus ?? ""] ??
                      "border-zinc-300 bg-zinc-50 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100";
                    const timeLabel = `${start.toLocaleTimeString("pl-PL", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })} – ${end.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}`;
                    return (
                      <div
                        key={a.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenAppointment(a.id);
                        }}
                        className={
                          "absolute z-10 cursor-pointer overflow-hidden rounded-lg border px-1.5 py-1 text-[11px] leading-tight shadow-sm transition hover:shadow " +
                          blockTone
                        }
                        style={{
                          top,
                          height,
                          left: `calc(${col * widthPct}% + 2px)`,
                          width: `calc(${widthPct}% - 4px)`,
                        }}
                        title={`${timeLabel} • ${a.patient.name} • ${a.customServiceName || a.service.name}`}
                      >
                        <div className="font-semibold">{timeLabel}</div>
                        <div className="truncate font-medium">
                          {a.customServiceName || a.service.name}
                        </div>
                        <div className="truncate">
                          {a.patient.name}
                          {showSpecialist && a.specialist ? ` • ${a.specialist.name}` : ""}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-white shadow-sm dark:bg-zinc-950">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={() => onAnchorChange(new Date())}>
            Dzisiaj
          </Button>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label={prevAriaLabel}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border hover:bg-zinc-50 dark:hover:bg-zinc-900"
              onClick={() => shift(-1)}
            >
              ‹
            </button>
            <button
              type="button"
              aria-label={nextAriaLabel}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border hover:bg-zinc-50 dark:hover:bg-zinc-900"
              onClick={() => shift(1)}
            >
              ›
            </button>
          </div>
          <div className="text-lg font-semibold capitalize">{rangeLabel}</div>
          {isLoading ? <div className="text-xs text-zinc-500">Ładowanie…</div> : null}
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-xl border bg-white p-1 text-sm shadow-sm dark:bg-zinc-950">
            {(
              [
                { key: "day", label: "Dzień" },
                { key: "week", label: "Tydzień" },
                { key: "month", label: "Miesiąc" },
              ] as const
            ).map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setMode(option.key)}
                className={
                  "rounded-lg px-3 py-1.5 font-medium transition " +
                  (mode === option.key
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                    : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white")
                }
              >
                {option.label}
              </button>
            ))}
          </div>
          {showAddButton && onAdd ? <Button onClick={() => onAdd()}>+ Dodaj</Button> : null}
        </div>
      </div>

      {mode === "month" ? (
        <>
          <div className="grid grid-cols-7 border-b text-xs font-medium text-zinc-500">
            {WEEKDAYS.map((w) => (
              <div key={w} className="px-3 py-2">
                {w}
              </div>
            ))}
          </div>

          <div>
            {weeks.map((row, ri) => (
              <div key={ri} className="grid grid-cols-7 border-b last:border-b-0">
                {row.map((d) => {
                  const inMonth = d.getMonth() === anchor.getMonth();
                  const isToday = sameDay(d, today);
                  const list = byDay.get(dateKey(d)) ?? [];
                  return (
                    <div
                      key={dateKey(d)}
                      className={
                        "min-h-[110px] border-r p-2 align-top last:border-r-0 " +
                        (onAdd ? "cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/40" : "")
                      }
                      onClick={onAdd ? () => onAdd(d) : undefined}
                    >
                      <div
                        className={
                          "mb-1 inline-flex h-6 min-w-6 items-center justify-center rounded-lg px-1 text-sm " +
                          (isToday
                            ? "bg-indigo-600 font-semibold text-white"
                            : inMonth
                              ? "text-zinc-800 dark:text-zinc-200"
                              : "text-zinc-400 dark:text-zinc-600")
                        }
                      >
                        {d.getDate()}
                      </div>
                      <div className="space-y-1">
                        {list.slice(0, 3).map((a) => {
                          const effectiveStatus =
                            a.approvalStatus === "REJECTED"
                              ? a.status
                              : effectiveAppointmentStatus(a.status, a.startsAt, clock);
                          return (
                            <div
                              key={a.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenAppointment(a.id);
                              }}
                              className="truncate rounded-md px-1 py-0.5 text-[11px] leading-tight hover:bg-white dark:hover:bg-zinc-800"
                              title={`${a.patient.name} • ${a.customServiceName || a.service.name}`}
                            >
                              <span
                                className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[effectiveStatus ?? ""] ?? "bg-zinc-400"}`}
                              />
                              {new Date(a.startsAt).toLocaleTimeString("pl-PL", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}{" "}
                              <span className="font-medium">
                                {a.customServiceName || a.service.name}
                              </span>
                              {showSpecialist && a.specialist ? (
                                <span className="text-zinc-500"> • {a.specialist.name}</span>
                              ) : null}
                            </div>
                          );
                        })}
                        {list.length > 3 ? (
                          <div className="px-1 text-[11px] text-zinc-500">
                            +{list.length - 3} więcej
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </>
      ) : (
        renderTimeGrid(visibleDays)
      )}
    </div>
  );
}

export { dateKey, startOfGrid };
