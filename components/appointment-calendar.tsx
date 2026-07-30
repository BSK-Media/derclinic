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
  isReservation?: boolean;
  patient: { name: string };
  service: {
    name: string;
    category?: string | null;
    categoryColor?: string | null;
  };
  specialist?: { id: string; name: string } | null;
};

type CalendarViewMode = "day" | "week" | "month";

export type CalendarSpecialist = {
  id: string;
  name: string;
  workDays?: Array<{ weekday: number; startTime: string; endTime: string }>;
  customWorkDays?: Array<{ date: string; startTime: string; endTime: string }>;
  timeOffs?: Array<{
    date: string;
    allDay: boolean;
    startTime?: string | null;
    endTime?: string | null;
  }>;
};

const WEEKDAYS = ["PON", "WT", "ŚR", "CZW", "PT", "SOB", "NDZ"];

function weekdayLabel(date: Date) {
  return WEEKDAYS[(date.getDay() + 6) % 7];
}

// Wysokość jednej godziny w widokach Dzień/Tydzień (px)
const HOUR_HEIGHT = 64;
// Domyślny zakres godzin — rozszerzany automatycznie, gdy wizyty wykraczają poza
const DEFAULT_START_HOUR = 7;
const DEFAULT_END_HOUR = 21;
const CATEGORY_COLORS = [
  { bg: "#ede9fe", border: "#8b5cf6", text: "#4c1d95" },
  { bg: "#dbeafe", border: "#3b82f6", text: "#1e3a8a" },
  { bg: "#dcfce7", border: "#22c55e", text: "#14532d" },
  { bg: "#fef3c7", border: "#f59e0b", text: "#78350f" },
  { bg: "#fce7f3", border: "#ec4899", text: "#831843" },
  { bg: "#cffafe", border: "#06b6d4", text: "#164e63" },
  { bg: "#ffedd5", border: "#f97316", text: "#7c2d12" },
] as const;

function categoryColor(category?: string | null) {
  const value = category?.trim() || "Bez kategorii";
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return CATEGORY_COLORS[hash % CATEGORY_COLORS.length];
}

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
function endOfGrid(d: Date) {
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const daysUntilSunday = (7 - last.getDay()) % 7;
  const grid = new Date(last);
  grid.setDate(grid.getDate() + daysUntilSunday);
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

type AppointmentResizeState = {
  appointment: CalendarAppointment;
  pointerId: number;
  startClientY: number;
  originalEndMs: number;
  previewEndMs: number;
};

// Układa nakładające się wizyty w kolumnach obok siebie (jak w Amelii)
function layoutOverlaps(list: CalendarAppointment[]): PositionedEvent[] {
  const sorted = [...list].sort(
    (a, b) => +new Date(a.startsAt) - +new Date(b.startsAt),
  );
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
    for (const item of items)
      positioned.push({ ...item, cols: colEnds.length });
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
  onDeleteAppointment,
  onMoveAppointment,
  specialists = [],
  showSpecialist = false,
  showAddButton = true,
}: {
  anchor: Date;
  onAnchorChange: (d: Date) => void;
  appointments: CalendarAppointment[];
  isLoading?: boolean;
  onAdd?: (date?: Date, specialistId?: string) => void;
  onOpenAppointment: (id: string) => void;
  onDeleteAppointment?: (appointment: CalendarAppointment) => void;
  onMoveAppointment?: (
    appointment: CalendarAppointment,
    startsAt: Date,
    endsAt: Date,
    specialistId?: string,
  ) => Promise<void> | void;
  specialists?: CalendarSpecialist[];
  showSpecialist?: boolean;
  showAddButton?: boolean;
}) {
  const [clock, setClock] = React.useState(() => new Date());
  const [mode, setMode] = React.useState<CalendarViewMode>("day");
  const [miniMonth, setMiniMonth] = React.useState(() => startOfMonth(anchor));
  const [mobileWeekAnimation, setMobileWeekAnimation] = React.useState<
    "next" | "previous" | null
  >(null);
  const mobileWeekTouchStartX = React.useRef<number | null>(null);
  const mobileWeekWasSwiped = React.useRef(false);
  const mobileWeekAnimationTimer = React.useRef<number | null>(null);
  const [draggedAppointmentId, setDraggedAppointmentId] = React.useState<
    string | null
  >(null);
  const [resizeState, setResizeState] =
    React.useState<AppointmentResizeState | null>(null);
  const resizeStateRef = React.useRef<AppointmentResizeState | null>(null);
  const suppressAppointmentClickRef = React.useRef<string | null>(null);
  const gridStart = React.useMemo(() => startOfGrid(anchor), [anchor]);
  const gridEnd = React.useMemo(() => endOfGrid(anchor), [anchor]);

  React.useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  React.useEffect(() => {
    setMiniMonth(startOfMonth(anchor));
  }, [anchor]);

  React.useEffect(
    () => () => {
      if (mobileWeekAnimationTimer.current !== null) {
        window.clearTimeout(mobileWeekAnimationTimer.current);
      }
    },
    [],
  );

  React.useEffect(() => {
    function handleResizeMove(event: PointerEvent) {
      const current = resizeStateRef.current;
      if (!current || event.pointerId !== current.pointerId) return;
      event.preventDefault();

      const deltaMinutes =
        Math.round(
          (((event.clientY - current.startClientY) / HOUR_HEIGHT) * 60) / 5,
        ) * 5;
      const startsAtMs = +new Date(current.appointment.startsAt);
      const startOfAppointmentDay = startOfDay(
        new Date(current.appointment.startsAt),
      );
      const endOfAppointmentDayMs =
        +startOfAppointmentDay + 24 * 60 * 60_000;
      const previewEndMs = Math.min(
        endOfAppointmentDayMs,
        Math.max(
          startsAtMs + 5 * 60_000,
          current.originalEndMs + deltaMinutes * 60_000,
        ),
      );
      const next = { ...current, previewEndMs };
      resizeStateRef.current = next;
      setResizeState(next);
    }

    function finishResize(event: PointerEvent, save: boolean) {
      const current = resizeStateRef.current;
      if (!current || event.pointerId !== current.pointerId) return;
      event.preventDefault();

      resizeStateRef.current = null;
      setResizeState(null);
      suppressAppointmentClickRef.current = current.appointment.id;
      window.setTimeout(() => {
        if (suppressAppointmentClickRef.current === current.appointment.id) {
          suppressAppointmentClickRef.current = null;
        }
      }, 0);

      if (save && onMoveAppointment) {
        void onMoveAppointment(
          current.appointment,
          new Date(current.appointment.startsAt),
          new Date(current.previewEndMs),
          current.appointment.specialist?.id,
        );
      }
    }

    function handleResizeEnd(event: PointerEvent) {
      finishResize(event, true);
    }

    function handleResizeCancel(event: PointerEvent) {
      finishResize(event, false);
    }

    window.addEventListener("pointermove", handleResizeMove, {
      passive: false,
    });
    window.addEventListener("pointerup", handleResizeEnd, { passive: false });
    window.addEventListener("pointercancel", handleResizeCancel, {
      passive: false,
    });
    return () => {
      window.removeEventListener("pointermove", handleResizeMove);
      window.removeEventListener("pointerup", handleResizeEnd);
      window.removeEventListener("pointercancel", handleResizeCancel);
    };
  }, [onMoveAppointment]);

  function beginAppointmentResize(
    event: React.PointerEvent<HTMLElement>,
    appointment: CalendarAppointment,
  ) {
    if (!onMoveAppointment) return;
    event.preventDefault();
    event.stopPropagation();
    setDraggedAppointmentId(null);
    suppressAppointmentClickRef.current = appointment.id;

    const state: AppointmentResizeState = {
      appointment,
      pointerId: event.pointerId,
      startClientY: event.clientY,
      originalEndMs: +new Date(appointment.endsAt),
      previewEndMs: +new Date(appointment.endsAt),
    };
    resizeStateRef.current = state;
    setResizeState(state);
  }

  const weeks = React.useMemo(() => {
    const cells: Date[] = [];
    for (
      const current = new Date(gridStart);
      current <= gridEnd;
      current.setDate(current.getDate() + 1)
    ) {
      const d = new Date(current);
      cells.push(d);
    }
    const rows: Date[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [gridEnd, gridStart]);

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
      onAnchorChange(
        new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1),
      );
      return;
    }
    const next = new Date(anchor);
    next.setDate(next.getDate() + direction * (mode === "week" ? 7 : 1));
    onAnchorChange(next);
  }

  const rangeLabel = React.useMemo(() => {
    if (mode === "month") {
      return anchor.toLocaleDateString("pl-PL", {
        month: "long",
        year: "numeric",
      });
    }
    if (mode === "week") {
      const start = startOfWeek(anchor);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      const startLabel = start.toLocaleDateString("pl-PL", {
        day: "2-digit",
        month: "2-digit",
      });
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
    mode === "month"
      ? "Poprzedni miesiąc"
      : mode === "week"
        ? "Poprzedni tydzień"
        : "Poprzedni dzień";
  const nextAriaLabel =
    mode === "month"
      ? "Następny miesiąc"
      : mode === "week"
        ? "Następny tydzień"
        : "Następny dzień";

  const mobileWeek = React.useMemo(() => {
    const start = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(start);
      day.setDate(day.getDate() + index);
      return day;
    });
  }, [anchor]);

  const miniMonthWeeks = React.useMemo(() => {
    const start = startOfGrid(miniMonth);
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(start);
      day.setDate(day.getDate() + index);
      return day;
    });
  }, [miniMonth]);

  function openDay(day: Date) {
    onAnchorChange(startOfDay(day));
    setMode("day");
  }

  function moveByWeeks(weeksToAdd: number) {
    const target = startOfDay(anchor);
    target.setDate(target.getDate() + weeksToAdd * 7);
    onAnchorChange(target);
    setMode("day");
  }

  function renderWeekShortcuts(compact = false) {
    return (
      <div
        className={
          compact ? "grid grid-cols-5 gap-1.5" : "grid grid-cols-5 gap-2"
        }
      >
        {[1, 2, 3, 4, 5].map((weeksToAdd) => {
          const target = new Date(anchor);
          target.setDate(target.getDate() + weeksToAdd * 7);
          return (
            <button
              key={weeksToAdd}
              type="button"
              onClick={() => moveByWeeks(weeksToAdd)}
              className={
                "rounded-lg border font-medium text-zinc-700 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:text-zinc-200 dark:hover:border-indigo-500/50 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-200 " +
                (compact ? "px-1 py-2 text-[11px]" : "px-1 py-2 text-xs")
              }
              title={`Przejdź do ${target.toLocaleDateString("pl-PL")}`}
            >
              +{weeksToAdd} tyg.
            </button>
          );
        })}
      </div>
    );
  }

  function renderMiniMonth() {
    return (
      <aside className="w-[260px] shrink-0 rounded-xl border bg-zinc-50/70 p-3 dark:bg-zinc-900/40">
        <div className="mb-3 flex items-center justify-between gap-2">
          <button
            type="button"
            aria-label="Poprzedni miesiąc w małym kalendarzu"
            className="flex h-8 w-8 items-center justify-center rounded-lg border bg-white text-lg hover:bg-zinc-50 dark:bg-zinc-950 dark:hover:bg-zinc-900"
            onClick={() =>
              setMiniMonth(
                new Date(miniMonth.getFullYear(), miniMonth.getMonth() - 1, 1),
              )
            }
          >
            ‹
          </button>
          <div className="text-sm font-semibold capitalize">
            {miniMonth.toLocaleDateString("pl-PL", {
              month: "long",
              year: "numeric",
            })}
          </div>
          <button
            type="button"
            aria-label="Następny miesiąc w małym kalendarzu"
            className="flex h-8 w-8 items-center justify-center rounded-lg border bg-white text-lg hover:bg-zinc-50 dark:bg-zinc-950 dark:hover:bg-zinc-900"
            onClick={() =>
              setMiniMonth(
                new Date(miniMonth.getFullYear(), miniMonth.getMonth() + 1, 1),
              )
            }
          >
            ›
          </button>
        </div>

        <div className="grid grid-cols-7 text-center text-[10px] font-semibold text-zinc-400">
          {WEEKDAYS.map((weekday) => (
            <div key={weekday} className="py-1">
              {weekday}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-1">
          {miniMonthWeeks.map((day) => {
            const inMonth = day.getMonth() === miniMonth.getMonth();
            const isSelected = sameDay(day, anchor);
            const isToday = sameDay(day, today);
            const hasAppointments = (byDay.get(dateKey(day))?.length ?? 0) > 0;

            return (
              <button
                key={dateKey(day)}
                type="button"
                onClick={() => openDay(day)}
                className={
                  "relative mx-auto flex h-7 w-7 items-center justify-center rounded-full text-xs transition " +
                  (isSelected
                    ? "bg-indigo-600 font-semibold text-white"
                    : isToday
                      ? "ring-1 ring-indigo-500 text-indigo-600 dark:text-indigo-300"
                      : inMonth
                        ? "text-zinc-800 hover:bg-white dark:text-zinc-200 dark:hover:bg-zinc-800"
                        : "text-zinc-400 hover:bg-white dark:text-zinc-600 dark:hover:bg-zinc-800")
                }
                aria-label={`Otwórz ${day.toLocaleDateString("pl-PL")}`}
              >
                {day.getDate()}
                {hasAppointments && !isSelected ? (
                  <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-indigo-500" />
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="mt-4 border-t pt-3">
          <div className="mb-2 text-xs font-medium text-zinc-500">
            Przejdź od wybranego dnia
          </div>
          {renderWeekShortcuts(true)}
        </div>
      </aside>
    );
  }

  function handleMobileWeekTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    mobileWeekTouchStartX.current = event.touches[0]?.clientX ?? null;
    mobileWeekWasSwiped.current = false;
  }

  function handleMobileWeekTouchMove(event: React.TouchEvent<HTMLDivElement>) {
    const startX = mobileWeekTouchStartX.current;
    const currentX = event.touches[0]?.clientX;
    if (startX === null || currentX === undefined) return;
    if (Math.abs(currentX - startX) > 8) mobileWeekWasSwiped.current = true;
  }

  function handleMobileWeekTouchEnd(event: React.TouchEvent<HTMLDivElement>) {
    const startX = mobileWeekTouchStartX.current;
    const endX = event.changedTouches[0]?.clientX;
    mobileWeekTouchStartX.current = null;
    if (startX === null || endX === undefined) return;

    const distance = endX - startX;
    if (Math.abs(distance) < 45) {
      mobileWeekWasSwiped.current = false;
      return;
    }

    const direction = distance < 0 ? "next" : "previous";
    setMobileWeekAnimation(direction);
    if (mobileWeekAnimationTimer.current !== null) {
      window.clearTimeout(mobileWeekAnimationTimer.current);
    }
    mobileWeekAnimationTimer.current = window.setTimeout(() => {
      setMobileWeekAnimation(null);
      mobileWeekAnimationTimer.current = null;
    }, 220);

    const next = new Date(anchor);
    next.setDate(next.getDate() + (direction === "next" ? 7 : -7));
    onAnchorChange(startOfDay(next));
  }

  function renderTimeGrid(days: Date[]) {
    if (days.length === 1 && specialists.length > 0) {
      return renderSpecialistDayGrid(days[0]);
    }
    const gridHeight = hours.length * HOUR_HEIGHT;
    const nowOffset =
      (clock.getHours() - hourRange.startHour) * HOUR_HEIGHT +
      (clock.getMinutes() / 60) * HOUR_HEIGHT;
    const nowVisible = nowOffset >= 0 && nowOffset <= gridHeight;

    return (
      <div className="overflow-auto">
        <div className="min-w-[640px]">
          {days.length > 1 ? (
            <div
              className="grid border-b"
              style={{
                gridTemplateColumns: `56px repeat(${days.length}, 1fr)`,
              }}
            >
              <div className="sticky left-0 z-30 border-r bg-white shadow-[4px_0_8px_-8px_rgba(0,0,0,0.45)] dark:bg-zinc-950" />
              {days.map((day) => {
                const isToday = sameDay(day, today);
                return (
                  <div
                    key={dateKey(day)}
                    className="calendar-vertical-line border-l px-2 py-2 text-center"
                  >
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

          <div
            className="grid"
            style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}
          >
            {/* Oś godzin */}
            <div
              className="sticky left-0 z-30 border-r bg-white shadow-[4px_0_8px_-8px_rgba(0,0,0,0.45)] dark:bg-zinc-950"
              style={{ height: gridHeight }}
            >
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
                  className="calendar-vertical-line relative border-l"
                  style={{ height: gridHeight }}
                >
                  {/* Linie godzin + kliknięcie w pusty slot */}
                  {hours.map((hour, index) => (
                    <div
                      key={hour}
                      className={
                        "absolute inset-x-0 border-t border-zinc-100 dark:border-zinc-800 " +
                        (onAdd
                          ? "cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
                          : "")
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
                      (start.getHours() - hourRange.startHour) * 60 +
                      start.getMinutes();
                    const rawDuration = Math.max(15, (+end - +start) / 60_000);
                    const top = (startMinutes / 60) * HOUR_HEIGHT;
                    const height = Math.max(
                      26,
                      (rawDuration / 60) * HOUR_HEIGHT - 2,
                    );
                    const widthPct = 100 / cols;
                    const effectiveStatus =
                      a.approvalStatus === "REJECTED"
                        ? a.status
                        : effectiveAppointmentStatus(
                            a.status,
                            a.startsAt,
                            clock,
                          );
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
                          "group absolute z-10 cursor-pointer overflow-hidden rounded-lg border px-1.5 py-1 pr-7 text-[11px] leading-tight shadow-sm transition hover:shadow " +
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
                        {onDeleteAppointment ? (
                          <button
                            type="button"
                            aria-label={
                              a.isReservation
                                ? "Usuń rezerwację czasu"
                                : "Usuń wizytę"
                            }
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              onDeleteAppointment(a);
                            }}
                            className="absolute right-1 top-1 z-30 flex h-5 w-5 items-center justify-center rounded-md bg-white/90 text-base font-semibold leading-none text-zinc-500 opacity-0 shadow-sm transition hover:bg-red-50 hover:text-red-600 focus:opacity-100 group-hover:opacity-100 dark:bg-zinc-900/90 dark:text-zinc-300 dark:hover:bg-red-950/70 dark:hover:text-red-300"
                            title={
                              a.isReservation
                                ? "Usuń rezerwację czasu"
                                : "Usuń wizytę"
                            }
                          >
                            ×
                          </button>
                        ) : null}
                        <div className="font-semibold">{timeLabel}</div>
                        <div className="truncate font-medium">
                          {a.customServiceName || a.service.name}
                        </div>
                        <div className="truncate">
                          {a.patient.name}
                          {showSpecialist && a.specialist
                            ? ` • ${a.specialist.name}`
                            : ""}
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

  function specialistWorkRange(specialist: CalendarSpecialist, day: Date) {
    const key = dateKey(day);
    const custom = specialist.customWorkDays?.find(
      (item) => dateKey(new Date(item.date)) === key,
    );
    const weekday = (day.getDay() + 6) % 7;
    const regular = specialist.workDays?.find(
      (item) => item.weekday === weekday,
    );
    const work = custom ?? regular;
    const dayOffs =
      specialist.timeOffs?.filter(
        (item) => dateKey(new Date(item.date)) === key,
      ) ?? [];
    if (!work || dayOffs.some((item) => item.allDay)) return null;
    return {
      startTime: work.startTime,
      endTime: work.endTime,
      timeOffs: dayOffs,
    };
  }

  function timeToMinutes(value: string) {
    const [hoursValue, minutesValue] = value.split(":").map(Number);
    return hoursValue * 60 + minutesValue;
  }

  function renderSpecialistDayGrid(day: Date) {
    const gridHeight = hours.length * HOUR_HEIGHT;
    const isToday = sameDay(day, today);
    const nowOffset =
      (clock.getHours() - hourRange.startHour) * HOUR_HEIGHT +
      (clock.getMinutes() / 60) * HOUR_HEIGHT;
    const nowVisible = nowOffset >= 0 && nowOffset <= gridHeight;

    return (
      <div className="overflow-auto">
        <div style={{ minWidth: Math.max(760, specialists.length * 220 + 58) }}>
          <div
            className="sticky top-0 z-30 grid border-b bg-white dark:bg-zinc-950"
            style={{
              gridTemplateColumns: `58px repeat(${specialists.length}, minmax(210px, 1fr))`,
            }}
          >
            <div className="sticky left-0 z-40 border-r bg-white shadow-[4px_0_8px_-8px_rgba(0,0,0,0.45)] dark:bg-zinc-950" />
            {specialists.map((specialist) => {
              const work = specialistWorkRange(specialist, day);
              return (
                <div
                  key={specialist.id}
                  className="border-r px-3 py-3 text-center last:border-r-0"
                >
                  <div className="truncate text-sm font-semibold">
                    {specialist.name}
                  </div>
                  <div
                    className={
                      work
                        ? "mt-0.5 text-xs text-emerald-600"
                        : "mt-0.5 text-xs text-zinc-400"
                    }
                  >
                    {work ? `${work.startTime}–${work.endTime}` : "Nie pracuje"}
                  </div>
                </div>
              );
            })}
          </div>

          <div
            className="grid"
            style={{
              gridTemplateColumns: `58px repeat(${specialists.length}, minmax(210px, 1fr))`,
            }}
          >
            <div
              className="sticky left-0 z-30 border-r bg-white shadow-[4px_0_8px_-8px_rgba(0,0,0,0.45)] dark:bg-zinc-950"
              style={{ height: gridHeight }}
            >
              {hours.map((hour, index) => (
                <div
                  key={hour}
                  className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums text-zinc-400"
                  style={{ top: index * HOUR_HEIGHT }}
                >
                  {index === 0 ? "" : `${String(hour).padStart(2, "0")}:00`}
                </div>
              ))}
            </div>

            {specialists.map((specialist) => {
              const work = specialistWorkRange(specialist, day);
              const list = appointments.filter(
                (appointment) =>
                  appointment.specialist?.id === specialist.id &&
                  sameDay(new Date(appointment.startsAt), day),
              );
              const positioned = layoutOverlaps(list);
              const workStart = work ? timeToMinutes(work.startTime) : 0;
              const workEnd = work ? timeToMinutes(work.endTime) : 0;

              return (
                <div
                  key={specialist.id}
                  className="calendar-vertical-line relative border-r last:border-r-0"
                  style={{ height: gridHeight }}
                  onDragOver={(event) => {
                    if (onMoveAppointment) event.preventDefault();
                  }}
                  onDrop={(event) => {
                    if (!onMoveAppointment || !draggedAppointmentId) return;
                    event.preventDefault();
                    const appointment = appointments.find(
                      (item) => item.id === draggedAppointmentId,
                    );
                    if (!appointment) return;
                    const rect = event.currentTarget.getBoundingClientRect();
                    const y = Math.max(
                      0,
                      Math.min(gridHeight, event.clientY - rect.top),
                    );
                    const minutesFromStart =
                      Math.round(((y / HOUR_HEIGHT) * 60) / 5) * 5;
                    const startsAt = new Date(day);
                    startsAt.setHours(
                      hourRange.startHour,
                      minutesFromStart,
                      0,
                      0,
                    );
                    const duration = Math.max(
                      5,
                      (+new Date(appointment.endsAt) -
                        +new Date(appointment.startsAt)) /
                        60_000,
                    );
                    const endsAt = new Date(+startsAt + duration * 60_000);
                    void onMoveAppointment(
                      appointment,
                      startsAt,
                      endsAt,
                      specialist.id,
                    );
                    setDraggedAppointmentId(null);
                  }}
                >
                  {hours.map((hour, index) => (
                    <div
                      key={hour}
                      className={
                        "absolute inset-x-0 border-t border-zinc-100 dark:border-zinc-800 " +
                        (onAdd
                          ? "cursor-pointer hover:bg-indigo-50/50 dark:hover:bg-indigo-500/5"
                          : "")
                      }
                      style={{ top: index * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                      onClick={
                        onAdd
                          ? () => {
                              const slot = new Date(day);
                              slot.setHours(hour, 0, 0, 0);
                              onAdd(slot, specialist.id);
                            }
                          : undefined
                      }
                    />
                  ))}

                  <div
                    className="pointer-events-none absolute inset-x-0 z-[1]"
                    style={{
                      insetBlock: 0,
                      background: work
                        ? `linear-gradient(to bottom,
                            rgba(113,113,122,.09) 0,
                            rgba(113,113,122,.09) ${Math.max(0, ((workStart - hourRange.startHour * 60) / 60) * HOUR_HEIGHT)}px,
                            transparent ${Math.max(0, ((workStart - hourRange.startHour * 60) / 60) * HOUR_HEIGHT)}px,
                            transparent ${Math.max(0, ((workEnd - hourRange.startHour * 60) / 60) * HOUR_HEIGHT)}px,
                            rgba(113,113,122,.09) ${Math.max(0, ((workEnd - hourRange.startHour * 60) / 60) * HOUR_HEIGHT)}px)`
                        : "repeating-linear-gradient(135deg, rgba(113,113,122,.10) 0 5px, rgba(113,113,122,.03) 5px 10px)",
                    }}
                  />

                  {work?.timeOffs
                    .filter(
                      (item) => !item.allDay && item.startTime && item.endTime,
                    )
                    .map((item, index) => {
                      const top =
                        ((timeToMinutes(item.startTime!) -
                          hourRange.startHour * 60) /
                          60) *
                        HOUR_HEIGHT;
                      const height =
                        ((timeToMinutes(item.endTime!) -
                          timeToMinutes(item.startTime!)) /
                          60) *
                        HOUR_HEIGHT;
                      return (
                        <div
                          key={`${item.startTime}-${index}`}
                          className="pointer-events-none absolute inset-x-0 z-[2] flex items-center justify-center bg-zinc-200/70 text-xs text-zinc-500 dark:bg-zinc-800/70"
                          style={{ top, height }}
                        >
                          Nieobecność
                        </div>
                      );
                    })}

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

                  {positioned.map(({ appointment, col, cols }) => {
                    const start = new Date(appointment.startsAt);
                    const isResizing =
                      resizeState?.appointment.id === appointment.id;
                    const end = new Date(
                      isResizing
                        ? resizeState.previewEndMs
                        : appointment.endsAt,
                    );
                    const top =
                      (((start.getHours() - hourRange.startHour) * 60 +
                        start.getMinutes()) /
                        60) *
                      HOUR_HEIGHT;
                    const duration = Math.max(15, (+end - +start) / 60_000);
                    const height = Math.max(
                      30,
                      (duration / 60) * HOUR_HEIGHT - 2,
                    );
                    const width = 100 / cols;
                    const color = appointment.isReservation
                      ? { bg: "#f4f4f5", border: "#71717a", text: "#27272a" }
                      : categoryColor(appointment.service.category);
                    const assignedCategoryColor =
                      appointment.service.categoryColor;
                    const time = `${start.toLocaleTimeString("pl-PL", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}–${end.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}`;

                    return (
                      <button
                        key={appointment.id}
                        type="button"
                        draggable={Boolean(onMoveAppointment)}
                        onDragStart={(event) => {
                          if (
                            resizeStateRef.current?.appointment.id ===
                            appointment.id
                          ) {
                            event.preventDefault();
                            return;
                          }
                          setDraggedAppointmentId(appointment.id);
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData(
                            "text/plain",
                            appointment.id,
                          );
                        }}
                        onDragEnd={() => setDraggedAppointmentId(null)}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (
                            suppressAppointmentClickRef.current ===
                            appointment.id
                          ) {
                            suppressAppointmentClickRef.current = null;
                            return;
                          }
                          if (!appointment.isReservation)
                            onOpenAppointment(appointment.id);
                        }}
                        className="group absolute z-10 cursor-grab overflow-hidden rounded-lg border-l-4 px-2 py-1 pb-2 pr-7 text-left text-[11px] leading-tight shadow-sm transition hover:brightness-[.98] active:cursor-grabbing"
                        style={{
                          top,
                          height,
                          left: `calc(${col * width}% + 2px)`,
                          width: `calc(${width}% - 4px)`,
                          backgroundColor: assignedCategoryColor
                            ? `${assignedCategoryColor}20`
                            : color.bg,
                          borderColor: assignedCategoryColor || color.border,
                          color: color.text,
                          opacity:
                            draggedAppointmentId === appointment.id ? 0.55 : 1,
                          userSelect: isResizing ? "none" : undefined,
                        }}
                        title="Przeciągnij kafelek, aby zmienić godzinę lub specjalistę. Przeciągnij dolny uchwyt, aby zmienić długość."
                      >
                        {onDeleteAppointment ? (
                          <span
                            role="button"
                            tabIndex={0}
                            aria-label={
                              appointment.isReservation
                                ? "Usuń rezerwację czasu"
                                : "Usuń wizytę"
                            }
                            draggable={false}
                            onPointerDown={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                            }}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              onDeleteAppointment(appointment);
                            }}
                            onKeyDown={(event) => {
                              if (event.key !== "Enter" && event.key !== " ")
                                return;
                              event.preventDefault();
                              event.stopPropagation();
                              onDeleteAppointment(appointment);
                            }}
                            className="absolute right-1 top-1 z-30 flex h-5 w-5 cursor-pointer items-center justify-center rounded-md bg-white/90 text-base font-semibold leading-none text-zinc-500 opacity-0 shadow-sm transition hover:bg-red-50 hover:text-red-600 focus:opacity-100 focus:outline-none group-hover:opacity-100 dark:bg-zinc-900/90 dark:text-zinc-300 dark:hover:bg-red-950/70 dark:hover:text-red-300"
                            title={
                              appointment.isReservation
                                ? "Usuń rezerwację czasu"
                                : "Usuń wizytę"
                            }
                          >
                            ×
                          </span>
                        ) : null}
                        <div className="font-semibold">{time}</div>
                        <div className="truncate font-semibold">
                          {appointment.isReservation
                            ? "REZERWACJA"
                            : appointment.customServiceName ||
                              appointment.service.name}
                        </div>
                        {!appointment.isReservation ? (
                          <div className="truncate">
                            {appointment.patient.name}
                          </div>
                        ) : null}
                        {onMoveAppointment ? (
                          <span
                            role="slider"
                            aria-label="Zmień długość wizyty"
                            aria-valuemin={5}
                            aria-valuenow={Math.round(
                              (+end - +start) / 60_000,
                            )}
                            draggable={false}
                            onPointerDown={(event) =>
                              beginAppointmentResize(event, appointment)
                            }
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                            }}
                            className="absolute inset-x-0 bottom-0 flex h-2.5 cursor-ns-resize touch-none items-center justify-center bg-black/[0.03] opacity-70 transition-opacity hover:bg-black/[0.08] hover:opacity-100 group-hover:opacity-100"
                            title="Przeciągnij, aby wydłużyć lub skrócić wizytę"
                          >
                            <span className="h-0.5 w-8 rounded-full bg-current opacity-50" />
                          </span>
                        ) : null}
                      </button>
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

  function renderMobileDay(day: Date) {
    const mobileStartHour = Math.min(6, hourRange.startHour);
    const mobileEndHour = Math.max(23, hourRange.endHour);
    const mobileHours = Array.from(
      { length: mobileEndHour - mobileStartHour + 1 },
      (_, index) => mobileStartHour + index,
    );
    const gridHeight = (mobileEndHour - mobileStartHour) * HOUR_HEIGHT;
    const list = byDay.get(dateKey(day)) ?? [];
    const positioned = layoutOverlaps(list);
    const isToday = sameDay(day, today);
    const nowOffset =
      (clock.getHours() - mobileStartHour) * HOUR_HEIGHT +
      (clock.getMinutes() / 60) * HOUR_HEIGHT;
    const nowVisible = nowOffset >= 0 && nowOffset <= gridHeight;

    return (
      <div className="grid grid-cols-[54px_minmax(0,1fr)]">
        <div className="relative" style={{ height: gridHeight }}>
          {mobileHours.map((hour, index) => (
            <div
              key={hour}
              className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums text-zinc-400"
              style={{ top: index * HOUR_HEIGHT }}
            >
              {String(hour).padStart(2, "0")}:00
            </div>
          ))}
        </div>
        <div className="relative" style={{ height: gridHeight }}>
          {mobileHours.map((hour, index) => (
            <div
              key={hour}
              className={
                "absolute inset-x-0 border-t border-zinc-100 dark:border-zinc-800 " +
                (onAdd && index < mobileHours.length - 1
                  ? "cursor-pointer active:bg-zinc-50 dark:active:bg-zinc-900/40"
                  : "")
              }
              style={{
                top: index * HOUR_HEIGHT,
                height: index < mobileHours.length - 1 ? HOUR_HEIGHT : 0,
              }}
              onClick={
                onAdd && index < mobileHours.length - 1
                  ? () => {
                      const slot = new Date(day);
                      slot.setHours(hour, 0, 0, 0);
                      onAdd(
                        slot,
                        specialists.length === 1
                          ? specialists[0]?.id
                          : undefined,
                      );
                    }
                  : undefined
              }
            />
          ))}

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

          {positioned.map(({ appointment: appointment, col, cols }) => {
            const start = new Date(appointment.startsAt);
            const end = new Date(appointment.endsAt);
            const startMinutes =
              (start.getHours() - mobileStartHour) * 60 + start.getMinutes();
            const duration = Math.max(15, (+end - +start) / 60_000);
            const top = (startMinutes / 60) * HOUR_HEIGHT;
            const height = Math.max(34, (duration / 60) * HOUR_HEIGHT - 2);
            const width = 100 / cols;
            const effectiveStatus =
              appointment.approvalStatus === "REJECTED"
                ? appointment.status
                : effectiveAppointmentStatus(
                    appointment.status,
                    appointment.startsAt,
                    clock,
                  );
            const blockTone =
              STATUS_BLOCK[effectiveStatus ?? ""] ??
              "border-zinc-300 bg-zinc-50 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100";
            const timeLabel = start.toLocaleTimeString("pl-PL", {
              hour: "2-digit",
              minute: "2-digit",
            });

            return (
              <button
                key={appointment.id}
                type="button"
                onClick={() => onOpenAppointment(appointment.id)}
                className={
                  "group absolute z-10 overflow-hidden rounded-lg border px-2 py-1 pr-7 text-left text-[11px] leading-tight shadow-sm " +
                  blockTone
                }
                style={{
                  top,
                  height,
                  left: `calc(${col * width}% + 2px)`,
                  width: `calc(${width}% - 4px)`,
                }}
              >
                {onDeleteAppointment ? (
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={
                      appointment.isReservation
                        ? "Usuń rezerwację czasu"
                        : "Usuń wizytę"
                    }
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onDeleteAppointment(appointment);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      event.stopPropagation();
                      onDeleteAppointment(appointment);
                    }}
                    className="absolute right-1 top-1 z-30 flex h-5 w-5 cursor-pointer items-center justify-center rounded-md bg-white/90 text-base font-semibold leading-none text-zinc-500 shadow-sm sm:opacity-0 sm:transition sm:hover:bg-red-50 sm:hover:text-red-600 sm:focus:opacity-100 sm:group-hover:opacity-100 dark:bg-zinc-900/90 dark:text-zinc-300 dark:hover:bg-red-950/70 dark:hover:text-red-300"
                    title={
                      appointment.isReservation
                        ? "Usuń rezerwację czasu"
                        : "Usuń wizytę"
                    }
                  >
                    ×
                  </span>
                ) : null}
                <div className="font-semibold">
                  {timeLabel} •{" "}
                  {appointment.customServiceName || appointment.service.name}
                </div>
                <div className="mt-0.5 truncate">
                  {appointment.patient.name}
                  {showSpecialist && appointment.specialist
                    ? ` • ${appointment.specialist.name}`
                    : ""}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="appointment-calendar rounded-2xl border bg-white shadow-sm dark:bg-zinc-950">
      <div className="sm:hidden">
        {mode === "month" ? (
          <>
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
              <div>
                <div className="text-xl font-semibold capitalize text-zinc-950 dark:text-zinc-50">
                  {anchor.toLocaleDateString("pl-PL", { month: "long" })}
                </div>
                <div className="text-sm text-zinc-500">
                  {anchor.getFullYear()}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-xl border px-3 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-200"
                  onClick={() => onAnchorChange(startOfDay(new Date()))}
                >
                  Dzisiaj
                </button>
                <div className="flex overflow-hidden rounded-xl border">
                  <button
                    type="button"
                    aria-label="Poprzedni miesiąc"
                    className="flex h-9 w-9 items-center justify-center border-r text-xl"
                    onClick={() =>
                      onAnchorChange(
                        new Date(
                          anchor.getFullYear(),
                          anchor.getMonth() - 1,
                          1,
                        ),
                      )
                    }
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    aria-label="Następny miesiąc"
                    className="flex h-9 w-9 items-center justify-center text-xl"
                    onClick={() =>
                      onAnchorChange(
                        new Date(
                          anchor.getFullYear(),
                          anchor.getMonth() + 1,
                          1,
                        ),
                      )
                    }
                  >
                    ›
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-7 border-b px-1 py-2 text-center text-[11px] font-semibold text-zinc-500">
              {WEEKDAYS.map((weekday) => (
                <div key={weekday}>{weekday}</div>
              ))}
            </div>

            <div>
              {weeks.map((row, rowIndex) => (
                <div
                  key={rowIndex}
                  className="grid grid-cols-7 border-b last:border-b-0"
                >
                  {row.map((day) => {
                    const inMonth = day.getMonth() === anchor.getMonth();
                    const isToday = sameDay(day, today);
                    const isSelected = sameDay(day, anchor);
                    const dayAppointments = byDay.get(dateKey(day)) ?? [];

                    return (
                      <button
                        key={dateKey(day)}
                        type="button"
                        className="flex min-h-[68px] min-w-0 flex-col items-center px-0.5 py-2 active:bg-zinc-50 dark:active:bg-zinc-900"
                        onClick={() => {
                          onAnchorChange(startOfDay(day));
                          setMode("day");
                        }}
                      >
                        <span
                          className={
                            "flex h-8 min-w-8 items-center justify-center rounded-full px-1 text-sm font-medium " +
                            (isSelected
                              ? "bg-indigo-600 text-white"
                              : isToday
                                ? "ring-2 ring-indigo-500 text-indigo-600 dark:text-indigo-300"
                                : inMonth
                                  ? "text-zinc-900 dark:text-zinc-100"
                                  : "text-zinc-400 dark:text-zinc-600")
                          }
                        >
                          {day.getDate()}
                        </span>
                        <span className="mt-2 flex h-2 max-w-full items-center justify-center gap-1">
                          {dayAppointments.slice(0, 4).map((appointment) => {
                            const effectiveStatus =
                              appointment.approvalStatus === "REJECTED"
                                ? appointment.status
                                : effectiveAppointmentStatus(
                                    appointment.status,
                                    appointment.startsAt,
                                    clock,
                                  );
                            return (
                              <span
                                key={appointment.id}
                                className={
                                  "h-1.5 w-1.5 shrink-0 rounded-full " +
                                  (STATUS_DOT[effectiveStatus ?? ""] ??
                                    "bg-zinc-400")
                                }
                              />
                            );
                          })}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
            {isLoading ? (
              <div className="border-t px-4 py-2 text-center text-xs text-zinc-500">
                Ładowanie…
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className="border-b px-3 pb-3 pt-2">
              <div className="mb-3 flex items-center justify-between gap-3">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-sm font-medium"
                  onClick={() => setMode("month")}
                >
                  <span aria-hidden="true">‹</span>
                  {anchor.toLocaleDateString("pl-PL", { month: "long" })}
                </button>
                <button
                  type="button"
                  className="rounded-xl border px-3 py-2 text-sm font-medium"
                  onClick={() => onAnchorChange(startOfDay(new Date()))}
                >
                  Dzisiaj
                </button>
              </div>

              <div className="overflow-hidden">
                <div
                  key={dateKey(mobileWeek[0])}
                  className={
                    "grid touch-pan-y grid-cols-7 gap-1 " +
                    (mobileWeekAnimation === "next"
                      ? "mobile-calendar-week-in-next"
                      : mobileWeekAnimation === "previous"
                        ? "mobile-calendar-week-in-previous"
                        : "")
                  }
                  onTouchStart={handleMobileWeekTouchStart}
                  onTouchMove={handleMobileWeekTouchMove}
                  onTouchEnd={handleMobileWeekTouchEnd}
                >
                  {mobileWeek.map((day) => {
                    const isSelected = sameDay(day, anchor);
                    const isToday = sameDay(day, today);
                    const dayAppointments = byDay.get(dateKey(day)) ?? [];
                    return (
                      <button
                        key={dateKey(day)}
                        type="button"
                        className="flex min-w-0 flex-col items-center rounded-xl py-1.5"
                        onClick={() => {
                          if (mobileWeekWasSwiped.current) return;
                          onAnchorChange(startOfDay(day));
                        }}
                      >
                        <span className="text-[10px] font-semibold text-zinc-500">
                          {weekdayLabel(day)}
                        </span>
                        <span
                          className={
                            "mt-1 flex h-9 min-w-9 items-center justify-center rounded-full px-1 text-sm font-semibold " +
                            (isSelected
                              ? "bg-indigo-600 text-white"
                              : isToday
                                ? "ring-2 ring-indigo-500 text-indigo-600 dark:text-indigo-300"
                                : "text-zinc-900 dark:text-zinc-100")
                          }
                        >
                          {day.getDate()}
                        </span>
                        <span className="mt-1 flex h-1.5 items-center justify-center gap-0.5">
                          {dayAppointments.slice(0, 3).map((appointment) => {
                            const effectiveStatus =
                              appointment.approvalStatus === "REJECTED"
                                ? appointment.status
                                : effectiveAppointmentStatus(
                                    appointment.status,
                                    appointment.startsAt,
                                    clock,
                                  );
                            return (
                              <span
                                key={appointment.id}
                                className={
                                  "h-1 w-1 rounded-full " +
                                  (STATUS_DOT[effectiveStatus ?? ""] ??
                                    "bg-zinc-400")
                                }
                              />
                            );
                          })}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="mt-3 border-t pt-3">
                <div className="mb-2 text-xs font-medium text-zinc-500">
                  Przejdź od wybranego dnia
                </div>
                {renderWeekShortcuts(true)}
              </div>
            </div>

            <div className="border-b px-4 py-3 text-center">
              <div className="font-semibold capitalize text-zinc-900 dark:text-zinc-100">
                {anchor.toLocaleDateString("pl-PL", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </div>
              {isLoading ? (
                <div className="mt-1 text-xs text-zinc-500">Ładowanie…</div>
              ) : null}
            </div>
            <div className="overflow-x-hidden">
              {renderMobileDay(startOfDay(anchor))}
            </div>
          </>
        )}
      </div>

      <div className="hidden sm:block">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              onClick={() => onAnchorChange(new Date())}
            >
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
            {isLoading ? (
              <div className="text-xs text-zinc-500">Ładowanie…</div>
            ) : null}
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
            {showAddButton && onAdd ? (
              <Button onClick={() => onAdd()}>+ Dodaj</Button>
            ) : null}
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
                <div
                  key={ri}
                  className="grid grid-cols-7 border-b last:border-b-0"
                >
                  {row.map((d) => {
                    const inMonth = d.getMonth() === anchor.getMonth();
                    const isToday = sameDay(d, today);
                    const list = byDay.get(dateKey(d)) ?? [];
                    return (
                      <div
                        key={dateKey(d)}
                        className={
                          "calendar-vertical-line min-h-[110px] border-r p-2 align-top last:border-r-0 " +
                          (onAdd
                            ? "cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
                            : "")
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
                                : effectiveAppointmentStatus(
                                    a.status,
                                    a.startsAt,
                                    clock,
                                  );
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
                                {new Date(a.startsAt).toLocaleTimeString(
                                  "pl-PL",
                                  {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  },
                                )}{" "}
                                <span className="font-medium">
                                  {a.customServiceName || a.service.name}
                                </span>
                                {showSpecialist && a.specialist ? (
                                  <span className="text-zinc-500">
                                    {" "}
                                    • {a.specialist.name}
                                  </span>
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
          <div className="flex items-start gap-4 p-4">
            <div className="min-w-0 flex-1 overflow-hidden rounded-xl border">
              {renderTimeGrid(visibleDays)}
            </div>
            {renderMiniMonth()}
          </div>
        )}
      </div>
      <style jsx global>{`
        @keyframes mobile-calendar-week-next {
          from {
            opacity: 0.55;
            transform: translateX(18px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes mobile-calendar-week-previous {
          from {
            opacity: 0.55;
            transform: translateX(-18px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        .mobile-calendar-week-in-next {
          animation: mobile-calendar-week-next 200ms ease-out;
        }

        .mobile-calendar-week-in-previous {
          animation: mobile-calendar-week-previous 200ms ease-out;
        }

        @media (max-width: 639px) {
          .dark .appointment-calendar .calendar-vertical-line {
            border-color: rgb(var(--app-dark-border) / 0.14) !important;
          }
        }
      `}</style>
    </div>
  );
}

export { dateKey, startOfGrid };
