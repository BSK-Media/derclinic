"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

export type CalendarAppointment = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  customServiceName?: string | null;
  patient: { name: string };
  service: { name: string };
  specialist?: { name: string } | null;
};

const WEEKDAYS = ["PON.", "WT", "ŚR", "CZW", "PT", "SOB", "SŁOŃCE"];

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
  COMPLETED: "bg-emerald-500",
  CANCELED: "bg-red-400",
  NO_SHOW: "bg-amber-500",
};

export function AppointmentCalendar({
  anchor,
  onAnchorChange,
  appointments,
  isLoading,
  onAdd,
  onOpenAppointment,
  showSpecialist = false,
}: {
  anchor: Date;
  onAnchorChange: (d: Date) => void;
  appointments: CalendarAppointment[];
  isLoading?: boolean;
  onAdd: (date?: Date) => void;
  onOpenAppointment: (id: string) => void;
  showSpecialist?: boolean;
}) {
  const gridStart = React.useMemo(() => startOfGrid(anchor), [anchor]);
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
    for (const list of map.values()) list.sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
    return map;
  }, [appointments]);

  const today = new Date();
  const monthLabel = anchor.toLocaleDateString("pl-PL", { month: "long", year: "numeric" });

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
              aria-label="Poprzedni miesiąc"
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border hover:bg-zinc-50 dark:hover:bg-zinc-900"
              onClick={() => onAnchorChange(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))}
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Następny miesiąc"
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border hover:bg-zinc-50 dark:hover:bg-zinc-900"
              onClick={() => onAnchorChange(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))}
            >
              ›
            </button>
          </div>
          <div className="text-lg font-semibold capitalize">{monthLabel}</div>
          {isLoading ? <div className="text-xs text-zinc-500">Ładowanie…</div> : null}
        </div>
        <Button onClick={() => onAdd()}>+ Dodaj</Button>
      </div>

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
                  className="min-h-[110px] cursor-pointer border-r p-2 align-top last:border-r-0 hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
                  onClick={() => onAdd(d)}
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
                    {list.slice(0, 3).map((a) => (
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
                          className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[a.status] ?? "bg-zinc-400"}`}
                        />
                        {new Date(a.startsAt).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}{" "}
                        <span className="font-medium">{a.customServiceName || a.service.name}</span>
                        {showSpecialist && a.specialist ? (
                          <span className="text-zinc-500"> • {a.specialist.name}</span>
                        ) : null}
                      </div>
                    ))}
                    {list.length > 3 ? (
                      <div className="px-1 text-[11px] text-zinc-500">+{list.length - 3} więcej</div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export { dateKey, startOfGrid };
