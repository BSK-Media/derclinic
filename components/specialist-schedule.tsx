"use client";

import * as React from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// 0 = poniedziałek ... 6 = niedziela (spójnie z API)
const WEEKDAY_LABELS = [
  "Poniedziałek",
  "Wtorek",
  "Środa",
  "Czwartek",
  "Piątek",
  "Sobota",
  "Niedziela",
];
const WEEKDAY_SHORT = ["PON", "WT", "ŚR", "CZW", "PT", "SOB", "NDZ"];
const MONTH_LABELS = [
  "Styczeń",
  "Luty",
  "Marzec",
  "Kwiecień",
  "Maj",
  "Czerwiec",
  "Lipiec",
  "Sierpień",
  "Wrzesień",
  "Październik",
  "Listopad",
  "Grudzień",
];

type WorkDay = { weekday: number; startTime: string; endTime: string };
type TimeOff = {
  id: string;
  date: string;
  allDay: boolean;
  startTime?: string | null;
  endTime?: string | null;
  note?: string | null;
};

function toDateInput(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Poniedziałek pierwszego tygodnia siatki miesięcznej
function startOfMonthGrid(anchor: Date) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const mondayIndex = (first.getDay() + 6) % 7; // 0 = poniedziałek
  const start = new Date(first);
  start.setDate(first.getDate() - mondayIndex);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function SpecialistSchedule({ specialistId }: { specialistId: string }) {
  const [anchor, setAnchor] = React.useState(() => new Date());

  const gridStart = React.useMemo(() => startOfMonthGrid(anchor), [anchor]);
  const gridDays = React.useMemo(() => {
    const days: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      days.push(d);
    }
    return days;
  }, [gridStart]);
  const gridEnd = gridDays[gridDays.length - 1];

  const { data, mutate, isLoading } = useSWR(
    `/api/admin/specialists/${specialistId}/schedule?from=${toDateInput(gridStart)}&to=${toDateInput(gridEnd)}`,
    fetcher,
  );

  const workDays: WorkDay[] = data?.workDays ?? [];
  const timeOffs: TimeOff[] = data?.timeOffs ?? [];

  // ==== Tygodniowy wzorzec pracy ====
  type PatternRow = { enabled: boolean; startTime: string; endTime: string };
  const [pattern, setPattern] = React.useState<PatternRow[]>(() =>
    Array.from({ length: 7 }, () => ({ enabled: false, startTime: "08:00", endTime: "16:00" })),
  );
  const [savingPattern, setSavingPattern] = React.useState(false);

  React.useEffect(() => {
    if (!data?.ok) return;
    setPattern(
      Array.from({ length: 7 }, (_, weekday) => {
        const found = (data.workDays as WorkDay[]).find((w) => w.weekday === weekday);
        return found
          ? { enabled: true, startTime: found.startTime, endTime: found.endTime }
          : { enabled: false, startTime: "08:00", endTime: "16:00" };
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.ok, JSON.stringify(data?.workDays)]);

  function updatePattern(weekday: number, patch: Partial<PatternRow>) {
    setPattern((prev) => prev.map((row, i) => (i === weekday ? { ...row, ...patch } : row)));
  }

  async function savePattern() {
    for (let i = 0; i < 7; i++) {
      const row = pattern[i];
      if (row.enabled && row.endTime <= row.startTime) {
        return toast.error(
          `${WEEKDAY_LABELS[i]}: godzina zakończenia musi być późniejsza niż rozpoczęcia`,
        );
      }
    }
    setSavingPattern(true);
    try {
      const res = await fetch(`/api/admin/specialists/${specialistId}/schedule`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workDays: pattern
            .map((row, weekday) => ({ weekday, startTime: row.startTime, endTime: row.endTime, enabled: row.enabled }))
            .filter((row) => row.enabled)
            .map(({ weekday, startTime, endTime }) => ({ weekday, startTime, endTime })),
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Nie udało się zapisać grafiku");
      toast.success("Zapisano grafik tygodniowy");
      mutate();
    } finally {
      setSavingPattern(false);
    }
  }

  // ==== Dodawanie wolnego ====
  const [offDate, setOffDate] = React.useState(() => toDateInput(new Date()));
  const [offAllDay, setOffAllDay] = React.useState(true);
  const [offStart, setOffStart] = React.useState("10:00");
  const [offEnd, setOffEnd] = React.useState("13:00");
  const [offNote, setOffNote] = React.useState("");
  const [savingOff, setSavingOff] = React.useState(false);
  const [deletingOffId, setDeletingOffId] = React.useState<string | null>(null);

  async function addTimeOff() {
    if (!offDate) return toast.error("Wybierz datę");
    if (!offAllDay && offEnd <= offStart) {
      return toast.error("Godzina zakończenia musi być późniejsza niż rozpoczęcia");
    }
    setSavingOff(true);
    try {
      const res = await fetch(`/api/admin/specialists/${specialistId}/schedule`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          date: offDate,
          allDay: offAllDay,
          startTime: offAllDay ? null : offStart,
          endTime: offAllDay ? null : offEnd,
          note: offNote.trim() || null,
        }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Nie udało się dodać wolnego");
      toast.success(offAllDay ? "Dodano dzień wolny" : "Dodano wolne godziny");
      setOffNote("");
      mutate();
    } finally {
      setSavingOff(false);
    }
  }

  async function deleteTimeOff(t: TimeOff) {
    const label = t.allDay ? "cały dzień" : `${t.startTime}–${t.endTime}`;
    if (
      !window.confirm(
        `Usunąć wolne (${label}) z dnia ${new Date(t.date).toLocaleDateString("pl-PL")}?`,
      )
    )
      return;
    setDeletingOffId(t.id);
    try {
      const res = await fetch(
        `/api/admin/specialists/${specialistId}/schedule?timeOffId=${encodeURIComponent(t.id)}`,
        { method: "DELETE" },
      );
      const out = await res.json().catch(() => ({}));
      if (!res.ok || !out?.ok) return toast.error(out?.message || "Nie udało się usunąć wpisu");
      toast.success("Usunięto wolne");
      mutate();
    } finally {
      setDeletingOffId(null);
    }
  }

  // ==== Pomocnicze do kalendarza ====
  const timeOffsByDate = React.useMemo(() => {
    const map = new Map<string, TimeOff[]>();
    for (const t of timeOffs) {
      const key = toDateInput(new Date(t.date));
      const list = map.get(key) ?? [];
      list.push(t);
      map.set(key, list);
    }
    return map;
  }, [timeOffs]);

  const todayKey = toDateInput(new Date());

  return (
    <div className="space-y-6">
      {/* Tygodniowy wzorzec pracy */}
      <Card className="space-y-4 p-4">
        <div>
          <div className="font-medium">Dni i godziny pracy</div>
          <div className="mt-1 text-xs text-slate-500">
            Zaznacz dni tygodnia, w które pracownik zazwyczaj pracuje, i ustaw godziny. W
            kalendarzu poniżej niezaznaczone dni będą oznaczone jako niedostępne.
          </div>
        </div>
        {isLoading ? <div className="text-sm text-slate-500">Ładowanie...</div> : null}
        <div className="grid gap-2">
          {pattern.map((row, weekday) => (
            <div
              key={weekday}
              className={
                "flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2 " +
                (row.enabled
                  ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-500/5"
                  : "border-slate-200 bg-slate-50/60 dark:border-white/10 dark:bg-white/5")
              }
            >
              <label className="flex w-40 cursor-pointer items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={row.enabled}
                  onChange={(e) => updatePattern(weekday, { enabled: e.target.checked })}
                />
                {WEEKDAY_LABELS[weekday]}
              </label>
              {row.enabled ? (
                <div className="flex items-center gap-2 text-sm">
                  <Input
                    type="time"
                    value={row.startTime}
                    onChange={(e) => updatePattern(weekday, { startTime: e.target.value })}
                    className="h-9 w-28"
                  />
                  <span className="text-slate-400">–</span>
                  <Input
                    type="time"
                    value={row.endTime}
                    onChange={(e) => updatePattern(weekday, { endTime: e.target.value })}
                    className="h-9 w-28"
                  />
                </div>
              ) : (
                <span className="text-sm text-slate-400">Nie pracuje</span>
              )}
            </div>
          ))}
        </div>
        <Button onClick={savePattern} disabled={savingPattern}>
          {savingPattern ? "Zapisywanie…" : "Zapisz grafik"}
        </Button>
      </Card>

      {/* Dodawanie wolnego */}
      <Card className="space-y-3 p-4">
        <div>
          <div className="font-medium">Dodaj wolne</div>
          <div className="mt-1 text-xs text-slate-500">
            Dzień wolny (np. urlop) albo wolne kilka godzin w konkretnym dniu. Możesz też kliknąć
            dzień w kalendarzu poniżej, aby podstawić datę.
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label>Data</Label>
            <Input
              type="date"
              value={offDate}
              onChange={(e) => setOffDate(e.target.value)}
              className="w-44"
            />
          </div>
          <label className="flex h-10 cursor-pointer items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={offAllDay}
              onChange={(e) => setOffAllDay(e.target.checked)}
            />
            Cały dzień
          </label>
          {!offAllDay ? (
            <>
              <div className="space-y-1">
                <Label>Od</Label>
                <Input
                  type="time"
                  value={offStart}
                  onChange={(e) => setOffStart(e.target.value)}
                  className="w-28"
                />
              </div>
              <div className="space-y-1">
                <Label>Do</Label>
                <Input
                  type="time"
                  value={offEnd}
                  onChange={(e) => setOffEnd(e.target.value)}
                  className="w-28"
                />
              </div>
            </>
          ) : null}
          <div className="min-w-[200px] flex-1 space-y-1">
            <Label>Notatka (opcjonalnie)</Label>
            <Input
              value={offNote}
              onChange={(e) => setOffNote(e.target.value)}
              placeholder="np. urlop, szkolenie, wizyta lekarska"
            />
          </div>
          <Button onClick={addTimeOff} disabled={savingOff}>
            {savingOff ? "Dodawanie…" : "Dodaj wolne"}
          </Button>
        </div>
      </Card>

      {/* Kalendarz dostępności */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div className="font-medium">Kalendarz dostępności</div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setAnchor(new Date())}>
              Dzisiaj
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setAnchor((a) => new Date(a.getFullYear(), a.getMonth() - 1, 1))
              }
            >
              ‹
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + 1, 1))
              }
            >
              ›
            </Button>
            <div className="ml-1 min-w-36 text-sm font-medium">
              {MONTH_LABELS[anchor.getMonth()]} {anchor.getFullYear()}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 border-b px-4 py-2 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded bg-emerald-100 ring-1 ring-emerald-300 dark:bg-emerald-500/20" />
            Dostępny (godziny pracy)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded bg-slate-100 ring-1 ring-slate-300 dark:bg-white/5" />
            Nie pracuje
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded bg-red-100 ring-1 ring-red-300 dark:bg-red-500/20" />
            Dzień wolny
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded bg-amber-100 ring-1 ring-amber-300 dark:bg-amber-500/20" />
            Wolne godziny
          </span>
        </div>

        <div className="grid grid-cols-7 border-b text-left text-xs uppercase text-slate-500">
          {WEEKDAY_SHORT.map((d) => (
            <div key={d} className="px-2 py-2">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {gridDays.map((day) => {
            const key = toDateInput(day);
            const weekday = (day.getDay() + 6) % 7;
            const inMonth = day.getMonth() === anchor.getMonth();
            const work = workDays.find((w) => w.weekday === weekday);
            const dayOffs = timeOffsByDate.get(key) ?? [];
            const fullDayOff = dayOffs.some((t) => t.allDay);

            const bg = fullDayOff
              ? "bg-red-50 dark:bg-red-500/10"
              : work
                ? "bg-emerald-50/50 dark:bg-emerald-500/5"
                : "bg-slate-50/70 dark:bg-white/[0.03]";

            return (
              <button
                key={key}
                type="button"
                onClick={() => setOffDate(key)}
                title="Kliknij, aby podstawić datę w formularzu wolnego"
                className={
                  "min-h-24 border-b border-r p-1.5 text-left align-top transition hover:ring-2 hover:ring-inset hover:ring-emerald-300 " +
                  bg +
                  (inMonth ? "" : " opacity-45")
                }
              >
                <div className="flex items-center justify-between">
                  <span
                    className={
                      "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold " +
                      (key === todayKey
                        ? "bg-indigo-600 text-white"
                        : "text-slate-700 dark:text-slate-200")
                    }
                  >
                    {day.getDate()}
                  </span>
                  {offDate === key ? (
                    <span className="rounded bg-indigo-100 px-1 text-[10px] font-medium text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
                      wybrano
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 space-y-1">
                  {fullDayOff ? (
                    <div className="text-[11px] font-medium text-red-700 dark:text-red-300">
                      Dzień wolny
                    </div>
                  ) : work ? (
                    <div className="text-[11px] text-emerald-700 dark:text-emerald-300">
                      {work.startTime}–{work.endTime}
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-400">Nie pracuje</div>
                  )}
                  {dayOffs.map((t) => (
                    <div
                      key={t.id}
                      className={
                        "flex items-center justify-between gap-1 rounded px-1 py-0.5 text-[11px] " +
                        (t.allDay
                          ? "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300")
                      }
                    >
                      <span className="truncate" title={t.note || undefined}>
                        {t.allDay ? "Wolne — cały dzień" : `Wolne ${t.startTime}–${t.endTime}`}
                        {t.note ? ` • ${t.note}` : ""}
                      </span>
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label="Usuń wolne"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteTimeOff(t);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.stopPropagation();
                            deleteTimeOff(t);
                          }
                        }}
                        className={
                          "shrink-0 cursor-pointer rounded px-1 font-semibold hover:bg-black/10 dark:hover:bg-white/10 " +
                          (deletingOffId === t.id ? "opacity-50" : "")
                        }
                      >
                        ×
                      </span>
                    </div>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
